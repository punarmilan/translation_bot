from typing import Annotated

import httpx
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.config import get_settings
from app.database import get_db
from app.security import decode_token, public_admin, require_admin

router = APIRouter(prefix="/admin/auth", tags=["admin-auth"])


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=6, max_length=128)


@router.post("/login")
async def login(body: LoginRequest) -> dict:
    settings = get_settings()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(f"{settings.PUBLIC_BACKEND_URL.rstrip('/')}/auth/login", json=body.model_dump())
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Authentication service unavailable") from exc
    if response.status_code != 200:
        detail = response.json().get("detail", "Invalid email or password") if response.headers.get("content-type", "").startswith("application/json") else "Invalid email or password"
        raise HTTPException(status_code=response.status_code, detail=detail)
    data = response.json()
    payload = decode_token(data.get("access_token", ""))
    try:
        user = await get_db()["users"].find_one({"_id": ObjectId(payload.get("sub"))}) if payload else None
    except Exception:
        user = None
    if not user or user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    if user.get("is_disabled") or user.get("deleted_at"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")
    return data


@router.get("/verify")
async def verify(admin: Annotated[dict, Depends(require_admin)]) -> dict:
    return public_admin(admin)
