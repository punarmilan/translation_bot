import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

from bson import ObjectId
from fastapi import Cookie, Depends, HTTPException, Request, status
import jwt
from passlib.context import CryptContext

from app.config import get_settings
from app.database import get_db

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
ALL_ADMIN_PERMISSIONS = {
    "dashboard.read", "users.read", "users.write", "meetings.read", "meetings.write",
    "analytics.read", "content.read", "content.write", "media.read", "media.write",
    "features.read", "features.write", "languages.read", "languages.write",
    "voices.read", "voices.write", "translation.read", "translation.write",
    "feedback.read", "feedback.write", "announcements.read", "announcements.write",
    "roles.read", "roles.write", "audit.read", "system.read", "settings.read", "settings.write",
}


def verify_password(plain_password: str, password_hash: str) -> bool:
    try:
        return pwd_context.verify(plain_password, password_hash)
    except (TypeError, ValueError):
        return False


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def token_fingerprint(jti: str) -> str:
    return hashlib.sha256(jti.encode("utf-8")).hexdigest()


def create_admin_token(admin: dict, token_use: str, session_id: str | None = None) -> tuple[str, dict]:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    lifetime = (
        timedelta(minutes=settings.ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES)
        if token_use == "access"
        else timedelta(days=settings.ADMIN_REFRESH_TOKEN_EXPIRE_DAYS)
    )
    claims = {
        "sub": str(admin["_id"]),
        "email": admin.get("email", ""),
        "role": "admin",
        "type": "admin",
        "token_use": token_use,
        "jti": secrets.token_urlsafe(32),
        "sid": session_id or secrets.token_urlsafe(24),
        "iat": int(now.timestamp()),
        "exp": int((now + lifetime).timestamp()),
        "iss": settings.ADMIN_TOKEN_ISSUER,
        "aud": settings.ADMIN_TOKEN_AUDIENCE,
    }
    encoded = jwt.encode(claims, settings.ADMIN_JWT_SECRET, algorithm=settings.ADMIN_JWT_ALGORITHM)
    return encoded, claims


def decode_admin_token(token: str, expected_use: str) -> dict | None:
    settings = get_settings()
    try:
        claims = jwt.decode(
            token,
            settings.ADMIN_JWT_SECRET,
            algorithms=[settings.ADMIN_JWT_ALGORITHM],
            audience=settings.ADMIN_TOKEN_AUDIENCE,
            issuer=settings.ADMIN_TOKEN_ISSUER,
        )
    except jwt.InvalidTokenError:
        return None
    if claims.get("type") != "admin" or claims.get("token_use") != expected_use:
        return None
    return claims


async def require_admin(
    request: Request,
    access_token: Annotated[str | None, Cookie(alias="admin_access")] = None,
) -> dict:
    if not access_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin authentication required")
    claims = decode_admin_token(access_token, "access")
    if not claims or not claims.get("sub"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired admin session")
    try:
        user = await get_db()["users"].find_one({"_id": ObjectId(claims["sub"])})
    except Exception:
        user = None
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Administrator not found")
    if user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    if user.get("is_disabled") or user.get("deleted_at"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")
    request.state.admin_claims = claims
    return user


def public_admin(user: dict) -> dict:
    return {
        "user_id": str(user["_id"]),
        "name": user.get("name") or user.get("username", ""),
        "username": user.get("username", ""),
        "email": user.get("email", ""),
        "role": "admin",
        "preferred_language": user.get("preferred_language", "en"),
        "admin_role": user.get("admin_role", "administrator"),
        "permissions": user.get("admin_permissions") or sorted(ALL_ADMIN_PERMISSIONS),
    }


def require_permission(permission: str):
    async def dependency(admin: Annotated[dict, Depends(require_admin)]) -> dict:
        permissions = set(admin.get("admin_permissions") or ALL_ADMIN_PERMISSIONS)
        if permission not in permissions:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Missing permission: {permission}")
        return admin

    return dependency
