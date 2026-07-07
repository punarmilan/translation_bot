import csv
import io
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field

from app.control_plane import control_plane
from app.database import get_db
from app.repositories.audit_repository import AuditRepository
from app.repositories.user_repository import AdminUserRepository
from app.security import ALL_ADMIN_PERMISSIONS, hash_password, require_permission

router = APIRouter(prefix="/api/admin/users", tags=["users"])


class UserUpdate(BaseModel):
    name: str | None = None
    role: Literal["admin", "host", "participant"] | None = None
    preferred_language: str | None = None
    voice_preference: Literal["auto", "feminine", "masculine", "neutral"] | None = None
    is_disabled: bool | None = None
    admin_role: str | None = None
    admin_permissions: list[str] | None = None


class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=254)
    password: str = Field(min_length=6, max_length=128)
    role: Literal["admin", "host", "participant"] = "participant"
    preferred_language: str = "en"
    pronouns: str | None = None
    voice_preference: Literal["auto", "feminine", "masculine", "neutral"] = "auto"


def serialize(user: dict) -> dict:
    return {
        "user_id": str(user["_id"]),
        "name": user.get("name") or user.get("username", ""),
        "username": user.get("username", ""),
        "email": user.get("email", ""),
        "role": user.get("role", "participant"),
        "preferred_language": user.get("preferred_language", "en"),
        "voice_preference": user.get("voice_preference", "auto"),
        "admin_role": user.get("admin_role"),
        "admin_permissions": user.get("admin_permissions", []),
        "meetings_joined": user.get("meetings_joined", 0),
        "status": "disabled" if user.get("is_disabled") else "online" if user.get("is_online") else "offline",
        "created_at": user.get("created_at").isoformat() if isinstance(user.get("created_at"), datetime) else user.get("created_at"),
        "last_seen": user.get("last_seen").isoformat() if isinstance(user.get("last_seen"), datetime) else user.get("last_seen"),
    }


@router.get("")
async def list_users(
    _: Annotated[dict, Depends(require_permission("users.read"))],
    search: str = "",
    role: str | None = None,
    status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort_by: str = "created_at",
    sort_dir: Literal["asc", "desc"] = "desc",
) -> dict:
    users, total = await AdminUserRepository(get_db()).list(search, role, status, page, page_size, sort_by, sort_dir)
    return {"items": [serialize(user) for user in users], "total": total, "page": page, "page_size": page_size}


@router.post("", status_code=201)
async def create_user(body: UserCreate, admin: Annotated[dict, Depends(require_permission("users.write"))]) -> dict:
    repo = AdminUserRepository(get_db())
    if await get_db()["users"].find_one({"email": body.email.lower().strip(), "deleted_at": {"$exists": False}}):
        raise HTTPException(status_code=409, detail="A user with this email already exists")
    role = await get_db()["admin_roles"].find_one({"key": "administrator"}) if body.role == "admin" else None
    user = await repo.create_user({
        **body.model_dump(exclude={"password"}),
        "password_hash": hash_password(body.password),
        "admin_role": "administrator" if body.role == "admin" else None,
        "admin_permissions": role.get("permissions", sorted(ALL_ADMIN_PERMISSIONS)) if body.role == "admin" and role else [],
    })
    await AuditRepository(get_db()).record(str(admin["_id"]), "user.create", "user", str(user["_id"]), {"email": body.email, "role": body.role})
    return serialize(user)


@router.get("/export.csv")
async def export_users_csv(
    _: Annotated[dict, Depends(require_permission("users.read"))],
    search: str = "",
    role: str | None = None,
    status: str | None = None,
) -> Response:
    users = await AdminUserRepository(get_db()).export(search, role, status)
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["name", "email", "role", "preferred_language", "status", "created_at", "last_seen"])
    writer.writeheader()
    for user in users:
        row = serialize(user)
        writer.writerow({key: row.get(key, "") for key in writer.fieldnames})
    return Response(
        output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=translation-bot-users.csv"},
    )


@router.get("/{user_id}")
async def get_user(user_id: str, _: Annotated[dict, Depends(require_permission("users.read"))]) -> dict:
    user = await AdminUserRepository(get_db()).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return serialize(user)


@router.get("/{user_id}/activity")
async def get_user_activity(user_id: str, _: Annotated[dict, Depends(require_permission("users.read"))]) -> dict:
    repo = AdminUserRepository(get_db())
    user = await repo.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    meetings = await repo.meeting_history(user)
    translation_usage = await repo.translation_usage(user)
    return {
        "user": serialize(user),
        "meeting_history": [
            {
                "room_id": room.get("room_id"),
                "room_name": room.get("room_name") or room.get("room_id"),
                "created_at": room.get("created_at").isoformat() if isinstance(room.get("created_at"), datetime) else room.get("created_at"),
                "status": "active" if room.get("is_active") else "ended",
                "participants": room.get("participant_count", 0),
                "languages": room.get("languages", []),
            }
            for room in meetings
        ],
        "translation_usage": translation_usage,
    }


@router.patch("/{user_id}")
async def update_user(user_id: str, body: UserUpdate, admin: Annotated[dict, Depends(require_permission("users.write"))]) -> dict:
    changes = body.model_dump(exclude_none=True)
    if changes.get("role") == "admin" and changes.get("admin_role"):
        role = await get_db()["admin_roles"].find_one({"key": changes["admin_role"]})
        if role:
            changes["admin_permissions"] = role.get("permissions", [])
    user = await AdminUserRepository(get_db()).update(user_id, changes)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await AuditRepository(get_db()).record(str(admin["_id"]), "user.update", "user", user_id, changes)
    return serialize(user)


@router.post("/{user_id}/disable")
async def disable_user(user_id: str, admin: Annotated[dict, Depends(require_permission("users.write"))]) -> dict:
    if user_id == str(admin["_id"]):
        raise HTTPException(status_code=400, detail="You cannot disable your own admin account")
    user = await AdminUserRepository(get_db()).update(user_id, {"is_disabled": True, "is_online": False})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    ack = await control_plane.publish_and_wait(
        command_type="FORCE_LOGOUT",
        actor_id=str(admin["_id"]),
        actor_email=admin.get("email", ""),
        target_user_id=user_id,
        payload={"reason": "Your account was suspended by an administrator."},
    )
    await AuditRepository(get_db()).record(
        str(admin["_id"]),
        "user.disable",
        "user",
        user_id,
        {"execution_status": ack.get("status"), "acknowledgement": ack},
    )
    return {**serialize(user), "acknowledgement": ack}


@router.post("/{user_id}/activate")
async def activate_user(user_id: str, admin: Annotated[dict, Depends(require_permission("users.write"))]) -> dict:
    user = await AdminUserRepository(get_db()).update(user_id, {"is_disabled": False})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await AuditRepository(get_db()).record(str(admin["_id"]), "user.activate", "user", user_id)
    return serialize(user)


@router.post("/{user_id}/promote")
async def promote_user(user_id: str, admin: Annotated[dict, Depends(require_permission("users.write"))]) -> dict:
    role = await get_db()["admin_roles"].find_one({"key": "administrator"})
    user = await AdminUserRepository(get_db()).update(user_id, {
        "role": "admin",
        "admin_role": "administrator",
        "admin_permissions": role.get("permissions", []) if role else sorted(ALL_ADMIN_PERMISSIONS),
    })
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await AuditRepository(get_db()).record(str(admin["_id"]), "user.promote", "user", user_id)
    return serialize(user)


@router.post("/{user_id}/reset-password")
async def reset_password(user_id: str, admin: Annotated[dict, Depends(require_permission("users.write"))]) -> dict:
    user = await AdminUserRepository(get_db()).update(user_id, {"force_password_reset": True})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await AuditRepository(get_db()).record(str(admin["_id"]), "user.require_password_reset", "user", user_id)
    return {"status": "password_reset_required", "user_id": user_id}


@router.delete("/{user_id}")
async def delete_user(user_id: str, admin: Annotated[dict, Depends(require_permission("users.write"))]) -> dict:
    if user_id == str(admin["_id"]):
        raise HTTPException(status_code=400, detail="You cannot delete your own admin account")
    deleted = await AdminUserRepository(get_db()).soft_delete(user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")
    ack = await control_plane.publish_and_wait(
        command_type="REMOVE_USER",
        actor_id=str(admin["_id"]),
        actor_email=admin.get("email", ""),
        target_user_id=user_id,
        payload={"reason": "Your account was removed by an administrator."},
    )
    await AuditRepository(get_db()).record(
        str(admin["_id"]),
        "user.soft_delete",
        "user",
        user_id,
        {"execution_status": ack.get("status"), "acknowledgement": ack},
    )
    return {"status": "deleted", "user_id": user_id, "acknowledgement": ack}
