from typing import Annotated

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from app.config import get_settings
from app.database import get_db
from app.repositories.audit_repository import AuditRepository
from app.repositories.session_repository import AdminSessionRepository
from app.security import require_permission
from app.serialization import serialize

router = APIRouter(prefix="/api/admin/security", tags=["admin-security"])


@router.get("/policy")
async def security_policy(_: Annotated[dict, Depends(require_permission("security.read"))]) -> dict:
    """Read-only view of the current admin session/cookie/rate-limit policy.

    Deliberately read-only for this pass, per ADMIN_IMPLEMENTATION_PLAN.md's
    Phase 11 scoping ("Read-only first ... Editable settings, only after the
    read-only version has been in use"). Session lifetime and rate-limit
    thresholds becoming admin-editable is explicitly the *next* increment,
    not this one.
    """
    from app.routers.auth import login_rate_limiter

    settings = get_settings()
    return {
        "session": {
            "access_token_expire_minutes": settings.ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES,
            "refresh_token_expire_days": settings.ADMIN_REFRESH_TOKEN_EXPIRE_DAYS,
        },
        "cookies": {
            "secure": settings.ADMIN_COOKIE_SECURE,
            "samesite": settings.ADMIN_COOKIE_SAMESITE,
            "domain": settings.ADMIN_COOKIE_DOMAIN or None,
        },
        "invitations": {
            "default_expire_hours": settings.ADMIN_INVITE_EXPIRE_HOURS,
        },
        "login_rate_limit": {
            "max_failed_attempts": login_rate_limiter.limit,
            "window_minutes": int(login_rate_limiter.window.total_seconds() // 60),
            # This limiter (and the equivalent one guarding the public
            # backend's /auth/login and /auth/forgot-password) is in-process
            # memory, not distributed via Redis or Mongo -- it resets on
            # restart and would not coordinate across multiple replicas of
            # this service. Documented here rather than silently assumed
            # correct; see PROJECT_HANDOFF.md for the full reasoning on why
            # this stays in-process for the current single-instance
            # deployment model.
            "distributed": False,
        },
    }


@router.get("/sessions")
async def list_sessions(_: Annotated[dict, Depends(require_permission("security.read"))]) -> dict:
    db = get_db()
    sessions = await AdminSessionRepository(db).list_active()

    admin_ids: list[ObjectId] = []
    for session in sessions:
        try:
            admin_ids.append(ObjectId(session["admin_id"]))
        except Exception:
            continue
    admins_by_id: dict[str, dict] = {}
    if admin_ids:
        async for admin in db["users"].find({"_id": {"$in": admin_ids}}, {"name": 1, "email": 1, "username": 1}):
            admins_by_id[str(admin["_id"])] = admin

    items = []
    for session in sessions:
        admin = admins_by_id.get(session["admin_id"])
        row = serialize(session)
        row["admin_name"] = (admin or {}).get("name") or (admin or {}).get("username") or "Unknown admin"
        row["admin_email"] = (admin or {}).get("email", "")
        items.append(row)
    return {"items": items}


@router.delete("/sessions/{session_id}")
async def revoke_session(session_id: str, admin: Annotated[dict, Depends(require_permission("security.write"))]) -> dict:
    db = get_db()
    repo = AdminSessionRepository(db)
    existing = await db["admin_sessions"].find_one({"session_id": session_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Session not found")
    if existing.get("revoked_at") is not None:
        raise HTTPException(status_code=400, detail="Session is already revoked")

    await repo.revoke(session_id, "revoked_by_admin")
    await AuditRepository(db).record(
        str(admin["_id"]),
        "admin_session.revoke",
        "admin_session",
        session_id,
        {"revoked_admin_id": existing.get("admin_id")},
    )
    return {"status": "revoked", "session_id": session_id}
