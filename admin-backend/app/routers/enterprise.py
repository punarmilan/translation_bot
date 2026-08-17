import logging
from datetime import datetime
from typing import Annotated, Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from bson import ObjectId
from app.database import get_db
from app.repositories.audit_repository import AuditRepository
from app.security import require_permission
from app.serialization import serialize

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/enterprise", tags=["enterprise-admin"])

# --- Schemas ---

class BrandingSettings(BaseModel):
    primary_color: str = "#4f46e5"
    logo_url: Optional[str] = None
    custom_footer: Optional[str] = None


class OrganizationCreateSchema(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    domain: str = Field(..., min_length=3, max_length=100)
    branding: BrandingSettings = Field(default_factory=BrandingSettings)
    enabled: bool = True


class OrganizationUpdateSchema(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=100)
    domain: Optional[str] = Field(default=None, min_length=3, max_length=100)
    branding: Optional[BrandingSettings] = None
    enabled: Optional[bool] = None


def _serialize_org(doc: dict) -> dict:
    doc = dict(doc)
    doc["_id"] = str(doc["_id"])
    if isinstance(doc.get("created_at"), datetime):
        doc["created_at"] = doc["created_at"].isoformat()
    if isinstance(doc.get("updated_at"), datetime):
        doc["updated_at"] = doc["updated_at"].isoformat()
    return doc


def _parse_org_id(org_id: str) -> ObjectId:
    try:
        return ObjectId(org_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid organization ID format")


# --- Endpoints ---

@router.get("/organizations")
async def list_organizations(
    admin: Annotated[dict, Depends(require_permission("enterprise.read"))],
) -> dict:
    db = get_db()
    cursor = db["organizations"].find({})
    rows = await cursor.to_list(length=100)
    return {"items": [_serialize_org(r) for r in rows]}


@router.post("/organizations")
async def create_organization(
    org: OrganizationCreateSchema,
    admin: Annotated[dict, Depends(require_permission("enterprise.write"))],
) -> dict:
    db = get_db()

    # Check if domain already exists
    existing = await db["organizations"].find_one({"domain": org.domain.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="An organization with this domain already exists.")

    doc = {
        "name": org.name.strip(),
        "domain": org.domain.lower().strip(),
        "branding": org.branding.model_dump(),
        "enabled": org.enabled,
        "created_at": datetime.utcnow(),
    }

    res = await db["organizations"].insert_one(doc)
    doc["_id"] = res.inserted_id
    await AuditRepository(db).record(str(admin["_id"]), "organization.create", "organization", str(res.inserted_id), {"name": doc["name"], "domain": doc["domain"]})
    return {"status": "success", "organization": _serialize_org(doc)}


@router.patch("/organizations/{org_id}")
async def update_organization(
    org_id: str,
    body: OrganizationUpdateSchema,
    admin: Annotated[dict, Depends(require_permission("enterprise.write"))],
) -> dict:
    db = get_db()
    oid = _parse_org_id(org_id)
    existing = await db["organizations"].find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Organization not found")

    changes = body.model_dump(exclude_none=True)
    if "domain" in changes:
        changes["domain"] = changes["domain"].lower().strip()
        duplicate = await db["organizations"].find_one({"domain": changes["domain"], "_id": {"$ne": oid}})
        if duplicate:
            raise HTTPException(status_code=400, detail="An organization with this domain already exists.")
    if "name" in changes:
        changes["name"] = changes["name"].strip()
    if not changes:
        return {"status": "success", "organization": _serialize_org(existing)}

    changes["updated_at"] = datetime.utcnow()
    await db["organizations"].update_one({"_id": oid}, {"$set": changes})
    updated = await db["organizations"].find_one({"_id": oid})
    await AuditRepository(db).record(str(admin["_id"]), "organization.update", "organization", org_id, changes)
    return {"status": "success", "organization": _serialize_org(updated)}


@router.get("/organizations/{org_id}/users")
async def list_org_users(
    org_id: str,
    admin: Annotated[dict, Depends(require_permission("enterprise.read"))],
) -> dict:
    db = get_db()
    # Design schema: user document contains "org_id" string
    cursor = db["users"].find({"org_id": org_id}, {"password_hash": 0})
    rows = await cursor.to_list(length=1000)
    for r in rows:
        r["_id"] = str(r["_id"])
        if "created_at" in r and isinstance(r["created_at"], datetime):
            r["created_at"] = r["created_at"].isoformat()
    return {"org_id": org_id, "users": rows}
