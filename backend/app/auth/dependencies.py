from typing import Annotated, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.service import decode_token
from app.database import get_db
from app.repositories.user_repository import UserRepository

_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Annotated[
        Optional[HTTPAuthorizationCredentials], Depends(_bearer)
    ],
) -> dict:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )
    payload = decode_token(credentials.credentials)
    if not payload or not payload.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    db = get_db()
    repo = UserRepository(db)
    user = await repo.find_by_id(payload["sub"])
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found"
        )
    return user


async def get_optional_user(
    credentials: Annotated[
        Optional[HTTPAuthorizationCredentials], Depends(_bearer)
    ],
) -> Optional[dict]:
    if not credentials:
        return None
    payload = decode_token(credentials.credentials)
    if not payload or not payload.get("sub"):
        return None
    db = get_db()
    repo = UserRepository(db)
    return await repo.find_by_id(payload["sub"])


def require_role(*roles: str):
    allowed_roles = set(roles)

    async def dependency(
        current_user: Annotated[dict, Depends(get_current_user)],
    ) -> dict:
        if current_user.get("role") not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to access this resource",
            )
        return current_user

    return dependency
