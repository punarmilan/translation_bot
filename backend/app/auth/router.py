from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from pymongo.errors import DuplicateKeyError

from app.auth.dependencies import get_current_user, require_role
from app.auth.service import create_access_token, hash_password, verify_password
from app.database import get_db
from app.repositories.user_repository import UserRepository

router = APIRouter(prefix="/auth", tags=["auth"])

VALID_ROLES = {"admin", "host", "participant"}
PUBLIC_SIGNUP_ROLES = {"host", "participant"}
VALID_LANGUAGES = {"en", "hi", "es", "fr", "de", "ja", "mr"}
UserRole = Literal["admin", "host", "participant"]


class SignupRequest(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=6, max_length=128)
    preferred_language: str = "en"
    role: str = "participant"

    @field_validator("username", "email", "preferred_language", "role")
    @classmethod
    def strip_strings(cls, value: str) -> str:
        return value.strip()

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        value = value.lower().strip()
        if "@" not in value or "." not in value.split("@")[-1]:
            raise ValueError("Enter a valid email address")
        return value

    @field_validator("role")
    @classmethod
    def normalize_role(cls, value: str) -> str:
        return value.lower().strip()

    @field_validator("preferred_language")
    @classmethod
    def normalize_language(cls, value: str) -> str:
        return value.lower().strip()


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.lower().strip()


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    username: str
    role: UserRole
    preferred_language: str


def auth_response_for_user(user: dict, access_token: str) -> AuthResponse:
    return AuthResponse(
        access_token=access_token,
        user_id=str(user["_id"]),
        username=user["username"],
        role=user.get("role", "participant"),
        preferred_language=user.get("preferred_language", "en"),
    )


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def signup(body: SignupRequest) -> AuthResponse:
    if body.role not in PUBLIC_SIGNUP_ROLES:
        raise HTTPException(
            status_code=400,
            detail="Signup role must be host or participant",
        )
    if body.preferred_language not in VALID_LANGUAGES:
        raise HTTPException(status_code=400, detail="Unsupported language")

    db = get_db()
    repo = UserRepository(db)

    if await repo.get_by_email(body.email):
        raise HTTPException(status_code=400, detail="Email already registered")
    if await repo.get_by_username(body.username):
        raise HTTPException(status_code=400, detail="Username already taken")

    try:
        user = await repo.create(
            username=body.username,
            email=body.email,
            password_hash=hash_password(body.password),
            role=body.role,
            preferred_language=body.preferred_language,
        )
    except DuplicateKeyError as exc:
        key_pattern = getattr(exc, "details", {}).get("keyPattern", {})
        if "email" in key_pattern:
            detail = "Email already registered"
        elif "username" in key_pattern:
            detail = "Username already taken"
        else:
            detail = "User already exists"
        raise HTTPException(status_code=400, detail=detail) from exc

    token = create_access_token(str(user["_id"]), user["username"], user["role"])
    return auth_response_for_user(user, token)


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest) -> AuthResponse:
    db = get_db()
    repo = UserRepository(db)

    user = await repo.get_by_email(body.email)
    password_hash = user.get("password_hash") if user else None
    if not user or not password_hash or not verify_password(body.password, password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(str(user["_id"]), user["username"], user["role"])
    await repo.update_last_seen(str(user["_id"]))
    return auth_response_for_user(user, token)


@router.get("/me")
async def me(
    current_user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    return {
        "user_id": str(current_user["_id"]),
        "username": current_user["username"],
        "email": current_user["email"],
        "role": current_user["role"],
        "preferred_language": current_user.get("preferred_language", "en"),
    }


@router.get("/users")
async def users(
    _: Annotated[dict, Depends(require_role("admin"))],
) -> list[dict]:
    db = get_db()
    repo = UserRepository(db)
    return [
        {
            "user_id": str(user["_id"]),
            "username": user["username"],
            "email": user["email"],
            "role": user["role"],
            "preferred_language": user.get("preferred_language", "en"),
            "created_at": user.get("created_at").isoformat()
            if user.get("created_at")
            else None,
            "last_seen": user.get("last_seen").isoformat()
            if user.get("last_seen")
            else None,
            "is_online": user.get("is_online", False),
        }
        for user in await repo.list_users()
    ]
