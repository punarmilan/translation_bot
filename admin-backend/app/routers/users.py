from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.database import get_db
from app.repositories.audit_repository import AuditRepository
from app.repositories.user_repository import AdminUserRepository
from app.security import require_admin

router = APIRouter(prefix="/admin/users", tags=["users"])


class UserUpdate(BaseModel):
    name: str | None = None
    role: Literal["admin", "host", "participant"] | None = None
    preferred_language: str | None = None
    voice_preference: Literal["auto", "feminine", "masculine", "neutral"] | None = None
    is_disabled: bool | None = None


def serialize(user: dict) -> dict:
    return {
        "user_id": str(user["_id"]),
        "name": user.get("name") or user.get("username", ""),
        "username": user.get("username", ""),
        "email": user.get("email", ""),
        "role": user.get("role", "participant"),
        "preferred_language": user.get("preferred_language", "en"),
        "voice_preference": user.get("voice_preference", "auto"),
        "meetings_joined": user.get("meetings_joined", 0),
        "status": "disabled" if user.get("is_disabled") else "online" if user.get("is_online") else "offline",
        "created_at": user.get("created_at").isoformat() if isinstance(user.get("created_at"), datetime) else user.get("created_at"),
        "last_seen": user.get("last_seen").isoformat() if isinstance(user.get("last_seen"), datetime) else user.get("last_seen"),
    }


@router.get("")
async def list_users(
    _: Annotated[dict, Depends(require_admin)],
    search: str = "",
    role: str | None = None,
    status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> dict:
    users, total = await AdminUserRepository(get_db()).list(search, role, status, page, page_size)
    return {"items": [serialize(user) for user in users], "total": total, "page": page, "page_size": page_size}


@router.get("/{user_id}")
async def get_user(user_id: str, _: Annotated[dict, Depends(require_admin)]) -> dict:
    user = await AdminUserRepository(get_db()).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return serialize(user)


@router.patch("/{user_id}")
async def update_user(user_id: str, body: UserUpdate, admin: Annotated[dict, Depends(require_admin)]) -> dict:
    changes = body.model_dump(exclude_none=True)
    user = await AdminUserRepository(get_db()).update(user_id, changes)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await AuditRepository(get_db()).record(str(admin["_id"]), "user.update", "user", user_id, changes)
    return serialize(user)


@router.post("/{user_id}/disable")
async def disable_user(user_id: str, admin: Annotated[dict, Depends(require_admin)]) -> dict:
    if user_id == str(admin["_id"]):
        raise HTTPException(status_code=400, detail="You cannot disable your own admin account")
    user = await AdminUserRepository(get_db()).update(user_id, {"is_disabled": True, "is_online": False})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await AuditRepository(get_db()).record(str(admin["_id"]), "user.disable", "user", user_id)
    return serialize(user)


@router.post("/{user_id}/promote")
async def promote_user(user_id: str, admin: Annotated[dict, Depends(require_admin)]) -> dict:
    user = await AdminUserRepository(get_db()).update(user_id, {"role": "admin"})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await AuditRepository(get_db()).record(str(admin["_id"]), "user.promote", "user", user_id)
    return serialize(user)


@router.post("/{user_id}/reset-password")
async def reset_password(user_id: str, admin: Annotated[dict, Depends(require_admin)]) -> dict:
    user = await AdminUserRepository(get_db()).update(user_id, {"force_password_reset": True})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await AuditRepository(get_db()).record(str(admin["_id"]), "user.require_password_reset", "user", user_id)
    return {"status": "password_reset_required", "user_id": user_id}


@router.delete("/{user_id}")
async def delete_user(user_id: str, admin: Annotated[dict, Depends(require_admin)]) -> dict:
    if user_id == str(admin["_id"]):
        raise HTTPException(status_code=400, detail="You cannot delete your own admin account")
    deleted = await AdminUserRepository(get_db()).soft_delete(user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")
    await AuditRepository(get_db()).record(str(admin["_id"]), "user.soft_delete", "user", user_id)
    return {"status": "deleted", "user_id": user_id}
