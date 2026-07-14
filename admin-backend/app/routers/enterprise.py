import logging
from datetime import datetime
from typing import Annotated, Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from bson import ObjectId
from app.database import get_db
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


# --- Endpoints ---

@router.get("/organizations")
async def list_organizations(
    admin: Annotated[dict, Depends(require_permission("enterprise.read"))],
) -> dict:
    db = get_db()
    cursor = db["organizations"].find({})
    rows = await cursor.to_list(length=100)
    for r in rows:
        r["_id"] = str(r["_id"])
        if "created_at" in r and isinstance(r["created_at"], datetime):
            r["created_at"] = r["created_at"].isoformat()
    return {"items": rows}


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
    doc["_id"] = str(res.inserted_id)
    doc["created_at"] = doc["created_at"].isoformat()
    return {"status": "success", "organization": doc}


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
