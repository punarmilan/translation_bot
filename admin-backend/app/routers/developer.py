"""Developer Tools module (ADMIN_IMPLEMENTATION_PLAN.md Phase 12).

Item 1, webhook subscriber CRUD, is implemented here: the `webhooks`
collection and dispatch logic (backend/app/integrations/webhooks.py's
WebhookManager) already exist on the public backend, but no admin route
could reach them. This writes directly to the same `webhooks` collection in
the shared MongoDB database -- the public backend's `dispatch_event()`
queries that collection fresh on every event, so a change here takes effect
on the very next dispatch with no control-plane command needed. (The admin
backend cannot import WebhookManager itself -- it is a separate FastAPI
app/process/Docker image with its own dependency set; the collection is the
integration point, matching how meeting_policy/feature_flags/etc. already
work between these two backends.)

Item 2, a command-queue detail view, is deliberately NOT implemented here.
Auditing app/control_plane.py (this app) and app/control_consumer.py (the
public backend) found the entire admin-command flow is Redis pub/sub only --
`publish_and_wait()` publishes a command and synchronously waits for an ack
on a separate channel with a timeout; nothing in either module ever writes
to an `admin_commands` MongoDB collection. The `queue_length` figure already
shown on the System Health page (`admin-backend/app/routers/system.py`,
`db["admin_commands"].count_documents({"status": "queued"})`) queries a
collection no code path in this repository ever writes to, so it is always
0 -- a pre-existing dead metric, not a real queue. Building an "inspection
view" for it would be inventing behavior around data that doesn't exist,
which is explicitly out of scope for this pass. See PROJECT_HANDOFF.md for
this finding.
"""

from datetime import datetime
from typing import Annotated, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.database import get_db
from app.repositories.audit_repository import AuditRepository
from app.security import require_permission

router = APIRouter(prefix="/api/admin/developer", tags=["admin-developer"])


class WebhookCreateSchema(BaseModel):
    url: str = Field(..., min_length=8, max_length=2048)
    secret: str = Field(..., min_length=16, max_length=256)
    events: list[str] = Field(..., min_length=1)

    @field_validator("url")
    @classmethod
    def validate_url_scheme(cls, value: str) -> str:
        if not (value.startswith("http://") or value.startswith("https://")):
            raise ValueError("Webhook URL must start with http:// or https://")
        return value.strip()

    @field_validator("events")
    @classmethod
    def normalize_events(cls, value: list[str]) -> list[str]:
        cleaned = [e.strip().lower() for e in value if e.strip()]
        if not cleaned:
            raise ValueError("At least one event must be specified")
        return cleaned


class WebhookUpdateSchema(BaseModel):
    url: Optional[str] = Field(default=None, min_length=8, max_length=2048)
    events: Optional[list[str]] = Field(default=None, min_length=1)
    enabled: Optional[bool] = None

    @field_validator("url")
    @classmethod
    def validate_url_scheme(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        if not (value.startswith("http://") or value.startswith("https://")):
            raise ValueError("Webhook URL must start with http:// or https://")
        return value.strip()

    @field_validator("events")
    @classmethod
    def normalize_events(cls, value: Optional[list[str]]) -> Optional[list[str]]:
        if value is None:
            return value
        cleaned = [e.strip().lower() for e in value if e.strip()]
        if not cleaned:
            raise ValueError("At least one event must be specified")
        return cleaned


def _parse_webhook_id(webhook_id: str) -> ObjectId:
    try:
        return ObjectId(webhook_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid webhook ID format")


def _serialize_webhook(doc: dict, *, reveal_secret: bool = False) -> dict:
    result = {
        "_id": str(doc["_id"]),
        "url": doc.get("url", ""),
        "events": doc.get("events", []),
        "enabled": doc.get("enabled", True),
        "created_at": doc["created_at"].isoformat() if isinstance(doc.get("created_at"), datetime) else doc.get("created_at"),
        # The signing secret is never returned by GET/PATCH -- only the
        # create response includes it once, matching the existing
        # "shown once" pattern already used for admin invitation codes
        # (POST /api/admin/auth/invitations).
        "secret_configured": bool(doc.get("secret")),
    }
    if reveal_secret:
        result["secret"] = doc.get("secret", "")
    return result


@router.get("/webhooks")
async def list_webhooks(_: Annotated[dict, Depends(require_permission("developer.read"))]) -> dict:
    db = get_db()
    rows = await db["webhooks"].find({}).sort("created_at", -1).to_list(length=200)
    return {"items": [_serialize_webhook(row) for row in rows]}


@router.post("/webhooks", status_code=201)
async def create_webhook(
    body: WebhookCreateSchema,
    admin: Annotated[dict, Depends(require_permission("developer.write"))],
) -> dict:
    db = get_db()
    doc = {
        "url": body.url,
        "secret": body.secret,
        "events": body.events,
        "enabled": True,
        "created_at": datetime.utcnow(),
    }
    result = await db["webhooks"].insert_one(doc)
    doc["_id"] = result.inserted_id
    await AuditRepository(db).record(
        str(admin["_id"]), "webhook.create", "webhook", str(result.inserted_id), {"url": body.url, "events": body.events}
    )
    return {"status": "success", "webhook": _serialize_webhook(doc, reveal_secret=True), "note": "The signing secret is shown once here and never returned again."}


@router.patch("/webhooks/{webhook_id}")
async def update_webhook(
    webhook_id: str,
    body: WebhookUpdateSchema,
    admin: Annotated[dict, Depends(require_permission("developer.write"))],
) -> dict:
    db = get_db()
    oid = _parse_webhook_id(webhook_id)
    existing = await db["webhooks"].find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Webhook not found")

    changes = body.model_dump(exclude_none=True)
    if not changes:
        return {"status": "success", "webhook": _serialize_webhook(existing)}

    await db["webhooks"].update_one({"_id": oid}, {"$set": changes})
    updated = await db["webhooks"].find_one({"_id": oid})
    await AuditRepository(db).record(str(admin["_id"]), "webhook.update", "webhook", webhook_id, changes)
    return {"status": "success", "webhook": _serialize_webhook(updated)}


@router.delete("/webhooks/{webhook_id}")
async def delete_webhook(
    webhook_id: str,
    admin: Annotated[dict, Depends(require_permission("developer.write"))],
) -> dict:
    db = get_db()
    oid = _parse_webhook_id(webhook_id)
    existing = await db["webhooks"].find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Webhook not found")

    await db["webhooks"].delete_one({"_id": oid})
    await AuditRepository(db).record(str(admin["_id"]), "webhook.delete", "webhook", webhook_id, {"url": existing.get("url")})
    return {"status": "deleted", "webhook_id": webhook_id}
