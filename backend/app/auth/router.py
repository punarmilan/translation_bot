from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel, Field, field_validator
from pymongo.errors import DuplicateKeyError


from app.auth.dependencies import get_current_user
from app.auth.service import create_access_token, create_refresh_token, decode_token, hash_password, verify_password
from app.database import get_db
from app.repositories.user_repository import UserRepository


import asyncio
from datetime import datetime, timedelta, timezone

class LoginRateLimiter:
    def __init__(self, limit: int = 5, window_minutes: int = 15) -> None:
        self.limit = limit
        self.window = timedelta(minutes=window_minutes)
        self._failed_attempts: dict[str, list[datetime]] = {}
        self._lock = asyncio.Lock()

    async def check_rate_limit(self, identifier: str) -> bool:
        async with self._lock:
            now = datetime.now(timezone.utc)
            attempts = self._failed_attempts.get(identifier, [])
            attempts = [a for a in attempts if now - a < self.window]
            self._failed_attempts[identifier] = attempts
            return len(attempts) < self.limit

    async def record_failure(self, identifier: str) -> None:
        async with self._lock:
            now = datetime.now(timezone.utc)
            self._failed_attempts.setdefault(identifier, []).append(now)

    async def reset(self, identifier: str) -> None:
        async with self._lock:
            self._failed_attempts.pop(identifier, None)

login_rate_limiter = LoginRateLimiter()


router = APIRouter(prefix="/auth", tags=["auth"])


VALID_ROLES = {"admin", "host", "participant"}
PUBLIC_SIGNUP_ROLES = {"host", "participant"}
VALID_LANGUAGES = {"ar", "de", "en", "es", "fr", "hi", "it", "nl", "pt", "ru"}
VALID_PRONOUNS = {"she/her", "he/him", "they/them", "prefer not to say"}
VALID_VOICE_PREFERENCES = {"feminine", "masculine", "neutral", "auto"}
UserRole = Literal["admin", "host", "co-host", "participant"]
VoicePreference = Literal["feminine", "masculine", "neutral", "auto"]
GenderType = Literal["feminine", "masculine", "neutral"]


class SignupRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=6, max_length=128)
    preferred_language: str = "en"
    role: str = "participant"
    pronouns: str | None = Field(default=None, max_length=40)
    voice_preference: VoicePreference = "auto"
    gender: GenderType = "neutral"

    @field_validator("name", "email", "preferred_language", "role", "voice_preference", "gender")
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

    @field_validator("voice_preference")
    @classmethod
    def normalize_voice_preference(cls, value: str) -> str:
        return value.lower().strip()

    @field_validator("pronouns")
    @classmethod
    def normalize_pronouns(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class ForgotPasswordRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.lower().strip()


class ForgotPasswordResponse(BaseModel):
    message: str


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.lower().strip()


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"
    user_id: str
    name: str
    username: str
    email: str
    role: UserRole
    preferred_language: str
    pronouns: str | None = None
    voice_preference: VoicePreference = "auto"
    gender: GenderType = "neutral"



class SignupResponse(BaseModel):
    user_id: str
    name: str
    username: str
    email: str
    role: UserRole
    preferred_language: str
    pronouns: str | None = None
    voice_preference: VoicePreference = "auto"
    gender: GenderType = "neutral"


class ProfileUpdateRequest(BaseModel):
    preferred_language: str = "en"
    pronouns: str | None = Field(default=None, max_length=40)
    voice_preference: str = "auto"
    gender: str = "neutral"
    preferred_voice: str = "auto"
    speech_speed: float = Field(default=1.0, ge=0.5, le=2.0)
    pitch: float = Field(default=1.0, ge=0.5, le=2.0)
    volume: float = Field(default=1.0, ge=0.0, le=1.0)
    gender_preference: str = "neutral"
    preferred_output_language: str = "en"
    emotion_profile: str = "neutral"

    @field_validator("preferred_language", "voice_preference", "gender")
    @classmethod
    def strip_strings(cls, value: str) -> str:
        return value.lower().strip()

    @field_validator("pronouns")
    @classmethod
    def normalize_pronouns(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


def public_user_for(user: dict) -> dict:
    return {
        "user_id": str(user["_id"]),
        "name": user.get("name") or user.get("username", ""),
        "username": user.get("username", ""),
        "email": user.get("email", ""),
        "role": user.get("role", "participant"),
        "preferred_language": user.get("preferred_language", "en"),
        "pronouns": user.get("pronouns"),
        "voice_preference": user.get("voice_preference", "auto"),
        "gender": user.get("gender", "neutral"),
        "preferred_voice": user.get("preferred_voice", "auto"),
        "speech_speed": user.get("speech_speed", 1.0),
        "pitch": user.get("pitch", 1.0),
        "volume": user.get("volume", 1.0),
        "gender_preference": user.get("gender_preference", "neutral"),
        "preferred_output_language": user.get("preferred_output_language", "en"),
        "emotion_profile": user.get("emotion_profile", "neutral"),
    }



def auth_response_for_user(user: dict, access_token: str, refresh_token: str | None = None) -> AuthResponse:
    return AuthResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        **public_user_for(user),
    )



@router.post("/signup", response_model=SignupResponse, status_code=status.HTTP_201_CREATED)
async def signup(body: SignupRequest) -> SignupResponse:
    if body.role not in PUBLIC_SIGNUP_ROLES:
        raise HTTPException(
            status_code=400,
            detail="Signup role must be host or participant",
        )
    if body.preferred_language not in VALID_LANGUAGES:
        raise HTTPException(status_code=400, detail="Unsupported language")
    if body.voice_preference not in VALID_VOICE_PREFERENCES:
        raise HTTPException(status_code=400, detail="Unsupported voice preference")

    db = get_db()
    repo = UserRepository(db)

    if await repo.get_by_email(body.email):
        raise HTTPException(status_code=400, detail="Email already registered")

    try:
        user = await repo.create(
            name=body.name,
            email=body.email,
            password_hash=hash_password(body.password),
            role=body.role,
            preferred_language=body.preferred_language,
            pronouns=body.pronouns,
            voice_preference=body.voice_preference,
            gender=body.gender,
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

    return SignupResponse(**public_user_for(user))


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
async def forgot_password(body: ForgotPasswordRequest) -> ForgotPasswordResponse:
    db = get_db()
    repo = UserRepository(db)
    user = await repo.get_by_email(body.email)
    if user:
        await db["password_reset_requests"].insert_one({
            "user_id": user["_id"],
            "email": body.email,
            "created_at": datetime.utcnow(),
            "status": "requested",
        })
    return ForgotPasswordResponse(message="If an account exists for this email, a reset request has been recorded.")


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest, request: Request) -> AuthResponse:
    client_ip = request.client.host if request.client else "127.0.0.1"
    if not await login_rate_limiter.check_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Too many failed login attempts. Please try again after 15 minutes.")

    db = get_db()
    repo = UserRepository(db)

    user = await repo.get_by_email(body.email)
    password_hash = user.get("password_hash") if user else None
    if not user or not password_hash or not verify_password(body.password, password_hash):
        await login_rate_limiter.record_failure(client_ip)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user.get("is_disabled") or user.get("deleted_at"):
        await login_rate_limiter.record_failure(client_ip)
        raise HTTPException(status_code=403, detail="Account is disabled")
    if user.get("role") == "admin":
        await login_rate_limiter.record_failure(client_ip)
        raise HTTPException(status_code=403, detail="Administrator accounts must use the admin portal")

    await login_rate_limiter.reset(client_ip)

    access_token = create_access_token(str(user["_id"]), user["username"], user["role"])
    refresh_token = create_refresh_token(str(user["_id"]), user["username"], user["role"])
    await repo.update_last_seen(str(user["_id"]))
    return auth_response_for_user(user, access_token, refresh_token)


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/refresh", response_model=AuthResponse)
async def refresh_token_route(body: RefreshRequest) -> AuthResponse:
    payload = decode_token(body.refresh_token, expected_use="refresh")
    if not payload or not payload.get("sub"):
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    db = get_db()
    repo = UserRepository(db)
    user = await repo.find_by_id(payload["sub"])
    if not user or user.get("is_disabled") or user.get("deleted_at"):
        raise HTTPException(status_code=403, detail="User account is disabled or inactive")

    access = create_access_token(str(user["_id"]), user["username"], user["role"])
    refresh = create_refresh_token(str(user["_id"]), user["username"], user["role"])
    return auth_response_for_user(user, access, refresh)



@router.get("/me")
async def me(
    current_user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    return {
        **public_user_for(current_user),
    }


@router.put("/me")
async def update_me(
    body: ProfileUpdateRequest,
    current_user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    if body.preferred_language not in VALID_LANGUAGES:
        raise HTTPException(status_code=400, detail="Unsupported language")
    if body.voice_preference not in VALID_VOICE_PREFERENCES:
        raise HTTPException(status_code=400, detail="Unsupported voice preference")

    db = get_db()
    repo = UserRepository(db)
    updated = await repo.update_profile(
        str(current_user["_id"]),
        preferred_language=body.preferred_language,
        pronouns=body.pronouns,
        voice_preference=body.voice_preference,
        gender=body.gender,
        preferred_voice=body.preferred_voice,
        speech_speed=body.speech_speed,
        pitch=body.pitch,
        volume=body.volume,
        gender_preference=body.gender_preference,
        preferred_output_language=body.preferred_output_language,
        emotion_profile=body.emotion_profile,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    return public_user_for(updated)



