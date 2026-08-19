import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from passlib.context import CryptContext

from app.config import get_settings

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

PASSWORD_RESET_TOKEN_TTL_MINUTES = 30


def hash_password(password: str) -> str:
    return _pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


def generate_password_reset_token() -> str:
    """Cryptographically random, high-entropy, URL-safe token handed to the
    requester once. Never persisted or logged in raw form -- see
    hash_reset_token()."""
    return secrets.token_urlsafe(32)


def hash_reset_token(token: str) -> str:
    """One-way hash of a reset token for storage/lookup. Using a hash (not
    the raw token) as the persisted value means a database read alone can't
    be used to complete someone else's reset."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_access_token(user_id: str, username: str, role: str) -> str:
    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub": user_id,
        "username": username,
        "role": role,
        "type": "user",
        "token_use": "access",
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(user_id: str, username: str, role: str) -> str:
    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(
        days=7  # Refresh tokens expire in 7 days
    )
    payload = {
        "sub": user_id,
        "username": username,
        "role": role,
        "type": "user",
        "token_use": "refresh",
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str, expected_use: str = "access") -> Optional[dict]:
    settings = get_settings()
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )
        if payload.get("type") != "user" or payload.get("token_use") != expected_use:
            return None
        return payload
    except jwt.InvalidTokenError:
        return None

