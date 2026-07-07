import hmac
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field, field_validator
from pymongo.errors import DuplicateKeyError

from app.config import get_settings
from app.database import get_db
from app.repositories.audit_repository import AuditRepository
from app.repositories.invitation_repository import AdminInvitationRepository
from app.repositories.session_repository import AdminSessionRepository
from app.repositories.user_repository import AdminUserRepository
from app.security import (
    ALL_ADMIN_PERMISSIONS,
    create_admin_token,
    decode_admin_token,
    hash_password,
    public_admin,
    require_admin,
    require_permission,
    token_fingerprint,
    verify_password,
)

router = APIRouter(prefix="/api/admin/auth", tags=["admin-auth"])


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=6, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.lower().strip()


class RegistrationRequest(LoginRequest):
    name: str = Field(min_length=2, max_length=100)
    password: str = Field(min_length=10, max_length=128)
    registration_code: str = Field(min_length=8, max_length=256)


class InvitationRequest(BaseModel):
    email: str | None = Field(default=None, max_length=254)
    expire_hours: int | None = Field(default=None, ge=1, le=168)

    @field_validator("email")
    @classmethod
    def normalize_optional_email(cls, value: str | None) -> str | None:
        return value.lower().strip() if value else None


def set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    settings = get_settings()
    common = {
        "httponly": True,
        "secure": settings.ADMIN_COOKIE_SECURE,
        "samesite": settings.ADMIN_COOKIE_SAMESITE,
        "domain": settings.ADMIN_COOKIE_DOMAIN or None,
    }
    response.set_cookie(
        "admin_access",
        access_token,
        max_age=settings.ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/api/admin",
        **common,
    )
    response.set_cookie(
        "admin_refresh",
        refresh_token,
        max_age=settings.ADMIN_REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/admin/auth",
        **common,
    )


def clear_auth_cookies(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie("admin_access", path="/api/admin", domain=settings.ADMIN_COOKIE_DOMAIN or None)
    response.delete_cookie("admin_refresh", path="/api/admin/auth", domain=settings.ADMIN_COOKIE_DOMAIN or None)


@router.get("/registration-status")
async def registration_status() -> dict:
    has_admin = await get_db()["users"].count_documents({"role": "admin", "deleted_at": {"$exists": False}}, limit=1) > 0
    return {
        "mode": "invite_only" if has_admin else "bootstrap",
        "registration_enabled": has_admin or bool(get_settings().ADMIN_BOOTSTRAP_CODE),
    }


@router.post("/register", status_code=201)
async def register(body: RegistrationRequest) -> dict:
    db = get_db()
    settings = get_settings()
    if await db["users"].find_one({"email": body.email}, {"_id": 1}):
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    has_admin = await db["users"].count_documents({"role": "admin", "deleted_at": {"$exists": False}}, limit=1) > 0
    bootstrap_claimed = False
    invitation = None
    if not has_admin:
        if not settings.ADMIN_BOOTSTRAP_CODE:
            raise HTTPException(status_code=503, detail="Initial admin registration is not configured")
        if not hmac.compare_digest(body.registration_code, settings.ADMIN_BOOTSTRAP_CODE):
            raise HTTPException(status_code=403, detail="Invalid bootstrap code")
        try:
            await db["admin_bootstrap"].insert_one({"_id": "initial-admin", "claimed_at": datetime.now(timezone.utc)})
            bootstrap_claimed = True
        except DuplicateKeyError as exc:
            raise HTTPException(status_code=409, detail="Initial administrator has already been registered") from exc
    else:
        invitation = await AdminInvitationRepository(db).consume(body.registration_code, body.email)
        if not invitation:
            raise HTTPException(status_code=403, detail="Invitation is invalid, expired, used, or assigned to another email")

    try:
        user = await AdminUserRepository(db).create_admin(
            name=body.name,
            email=body.email,
            password_hash=hash_password(body.password),
            permissions=sorted(ALL_ADMIN_PERMISSIONS),
        )
    except DuplicateKeyError as exc:
        if bootstrap_claimed:
            await db["admin_bootstrap"].delete_one({"_id": "initial-admin"})
        raise HTTPException(status_code=409, detail="Administrator account already exists") from exc

    await AuditRepository(db).record(
        str(user["_id"]),
        "admin.register",
        "admin",
        str(user["_id"]),
        {"method": "bootstrap" if bootstrap_claimed else "invitation", "invitation_id": str(invitation["_id"]) if invitation else None},
    )
    return {"status": "registered", "admin": public_admin(user)}


@router.post("/invitations", status_code=201)
async def create_invitation(
    body: InvitationRequest,
    admin: Annotated[dict, Depends(require_permission("roles.write"))],
) -> dict:
    expire_hours = body.expire_hours or get_settings().ADMIN_INVITE_EXPIRE_HOURS
    token, invitation = await AdminInvitationRepository(get_db()).create(str(admin["_id"]), body.email, expire_hours)
    await AuditRepository(get_db()).record(
        str(admin["_id"]),
        "admin_invitation.create",
        "admin_invitation",
        str(invitation["_id"]),
        {"email": body.email, "expire_hours": expire_hours},
    )
    return {
        "invitation_code": token,
        "email": invitation["email"],
        "expires_at": invitation["expires_at"].isoformat(),
        "note": "This code is displayed once. Share it through a secure channel.",
    }


@router.post("/login")
async def login(body: LoginRequest, request: Request, response: Response) -> dict:
    db = get_db()
    user = await db["users"].find_one({"email": body.email})
    password_hash = user.get("password_hash") if user else None
    if not user or not password_hash or not verify_password(body.password, password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    if user.get("is_disabled") or user.get("deleted_at"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")

    refresh_token, refresh_claims = create_admin_token(user, "refresh")
    access_token, _ = create_admin_token(user, "access", refresh_claims["sid"])
    await AdminSessionRepository(db).create(
        admin_id=str(user["_id"]),
        session_id=refresh_claims["sid"],
        refresh_fingerprint=token_fingerprint(refresh_claims["jti"]),
        expires_at=datetime.fromtimestamp(refresh_claims["exp"], tz=timezone.utc),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await AuditRepository(db).record(str(user["_id"]), "admin.login", "admin_session", refresh_claims["sid"])
    set_auth_cookies(response, access_token, refresh_token)
    return {"admin": public_admin(user), "expires_in": get_settings().ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES * 60}


@router.post("/refresh")
async def refresh(
    request: Request,
    response: Response,
    refresh_token: Annotated[str | None, Cookie(alias="admin_refresh")] = None,
) -> dict:
    claims = decode_admin_token(refresh_token or "", "refresh")
    if not claims:
        clear_auth_cookies(response)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh session")
    sessions = AdminSessionRepository(get_db())
    session = await sessions.get_active(claims["sid"], token_fingerprint(claims["jti"]))
    if not session:
        clear_auth_cookies(response)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh session was revoked")
    user = await get_db()["users"].find_one({"_id": session["admin_object_id"]})
    if not user or user.get("role") != "admin" or user.get("is_disabled") or user.get("deleted_at"):
        await sessions.revoke(claims["sid"], "account_not_authorized")
        clear_auth_cookies(response)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    new_refresh, new_claims = create_admin_token(user, "refresh", claims["sid"])
    new_access, _ = create_admin_token(user, "access", claims["sid"])
    await sessions.rotate(
        claims["sid"],
        token_fingerprint(new_claims["jti"]),
        datetime.fromtimestamp(new_claims["exp"], tz=timezone.utc),
        request.client.host if request.client else None,
    )
    set_auth_cookies(response, new_access, new_refresh)
    return {"admin": public_admin(user), "expires_in": get_settings().ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES * 60}


@router.post("/logout", status_code=204)
async def logout(
    response: Response,
    refresh_token: Annotated[str | None, Cookie(alias="admin_refresh")] = None,
) -> None:
    claims = decode_admin_token(refresh_token or "", "refresh")
    if claims:
        await AdminSessionRepository(get_db()).revoke(claims["sid"], "logout")
        await AuditRepository(get_db()).record(claims["sub"], "admin.logout", "admin_session", claims["sid"])
    clear_auth_cookies(response)


@router.get("/session")
async def session(admin: Annotated[dict, Depends(require_admin)]) -> dict:
    return {"admin": public_admin(admin)}
