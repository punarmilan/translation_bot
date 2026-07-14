from datetime import datetime, timezone
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.database import get_db
from app.repositories.audit_repository import AuditRepository
from app.repositories.platform_repository import PlatformRepository
from app.security import ALL_ADMIN_PERMISSIONS, require_permission
from app.serialization import serialize

router = APIRouter(prefix="/api/admin", tags=["admin-platform"])
public_router = APIRouter(prefix="/api/public", tags=["public-content"])

CONTENT_DEFAULTS = [
    {"key": "landing.hero", "page": "landing", "label": "Hero", "status": "draft", "content": {"eyebrow": "Meet across languages", "title": "Conversations without borders", "body": "Video meetings with live multilingual communication.", "primary_button": "Get started", "secondary_button": "How it works", "image_id": None}},
    {"key": "landing.features", "page": "landing", "label": "Feature highlights", "status": "draft", "content": {"heading": "Everything your team needs", "items": []}},
    {"key": "features.page", "page": "features", "label": "Features page", "status": "draft", "content": {"title": "One meeting, every language", "body": "", "items": []}},
    {"key": "solutions.page", "page": "solutions", "label": "Solutions page", "status": "draft", "content": {"title": "Built for global collaboration", "body": "", "items": []}},
    {"key": "site.faqs", "page": "shared", "label": "FAQs", "status": "draft", "content": {"items": []}},
    {"key": "site.footer", "page": "shared", "label": "Footer", "status": "draft", "content": {"tagline": "Meet, speak, and collaborate across languages.", "links": []}},
    {"key": "pricing.page", "page": "pricing", "label": "Pricing text", "status": "draft", "content": {"title": "Simple plans for global teams", "plans": []}},
    {"key": "landing.testimonials", "page": "landing", "label": "Testimonials", "status": "draft", "content": {"items": []}},
]

LANGUAGE_DEFAULTS = [
    {"key": code, "code": code, "name": name, "enabled": True, "stt_enabled": True, "translation_enabled": True, "tts_enabled": True}
    for code, name in [
        ("en", "English"), ("hi", "Hindi"), ("de", "German"), ("es", "Spanish"), ("fr", "French"),
        ("ar", "Arabic"), ("nl", "Dutch"), ("it", "Italian"), ("pt", "Portuguese"), ("ru", "Russian"),
    ]
]

FEATURE_FLAG_DEFAULTS = [
    {"key": "video_calling", "name": "Video Calling", "description": "Enable WebRTC video meetings", "enabled": True},
    {"key": "voice_translation", "name": "Voice Translation", "description": "Enable real-time translated speech", "enabled": True},
    {"key": "live_captions", "name": "Live Captions", "description": "Show live transcripts and translated captions", "enabled": True},
    {"key": "recording", "name": "Recording", "description": "Allow meeting recording controls", "enabled": False},
    {"key": "screen_sharing", "name": "Screen Sharing", "description": "Allow browser screen sharing", "enabled": False},
    {"key": "meeting_summary", "name": "Meeting Summary", "description": "Generate post-meeting summaries", "enabled": False},
    {"key": "experimental_features", "name": "Experimental Features", "description": "Expose preview functionality", "enabled": False},
]

VOICE_MODEL_DEFAULTS = [
    {"key": "en-neutral", "name": "English Neutral", "description": "Default English Piper voice", "enabled": True, "metadata": {"language": "en", "gender": "neutral", "model_path": "models/en"}},
    {"key": "hi-neutral", "name": "Hindi Neutral", "description": "Default Hindi Piper voice", "enabled": True, "metadata": {"language": "hi", "gender": "neutral", "model_path": "models/hi"}},
    {"key": "de-neutral", "name": "German Neutral", "description": "Default German Piper voice", "enabled": True, "metadata": {"language": "de", "gender": "neutral", "model_path": "models/de"}},
    {"key": "es-neutral", "name": "Spanish Neutral", "description": "Default Spanish Piper voice", "enabled": True, "metadata": {"language": "es", "gender": "neutral", "model_path": "models/es"}},
    {"key": "fr-neutral", "name": "French Neutral", "description": "Default French Piper voice", "enabled": True, "metadata": {"language": "fr", "gender": "neutral", "model_path": "models/fr"}},
]

ANNOUNCEMENT_DEFAULTS = [
    {"key": "welcome-banner", "name": "Welcome banner", "description": "Default inactive welcome announcement", "enabled": False, "status": "draft", "value": {"type": "banner", "title": "Welcome", "body": "Thanks for trying the multilingual meeting platform.", "starts_at": None, "ends_at": None}},
]


class ContentUpdate(BaseModel):
    content: dict[str, Any]
    status: Literal["draft", "published", "archived"] = "draft"
    label: str | None = Field(default=None, max_length=120)


class GenericCreate(BaseModel):
    key: str = Field(min_length=2, max_length=100)
    name: str | None = Field(default=None, max_length=160)
    description: str | None = Field(default=None, max_length=500)
    enabled: bool = True
    status: str | None = None
    value: Any = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class GenericUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=160)
    description: str | None = Field(default=None, max_length=500)
    enabled: bool | None = None
    value: Any = None
    status: str | None = None
    metadata: dict[str, Any] | None = None
    stt_enabled: bool | None = None
    translation_enabled: bool | None = None
    tts_enabled: bool | None = None


class SettingsUpdate(BaseModel):
    values: dict[str, Any]


class FeedbackCreate(BaseModel):
    type: Literal["bug", "feature", "rating"] = "bug"
    title: str = Field(min_length=2, max_length=180)
    description: str = Field(min_length=2, max_length=2000)
    rating: int | None = Field(default=None, ge=1, le=5)
    screenshot_url: str | None = None
    reporter_email: str | None = None


class FeedbackUpdate(BaseModel):
    status: Literal["new", "reviewing", "resolved", "closed"] | None = None
    assigned_to: str | None = None
    reply: str | None = Field(default=None, max_length=2000)


class RoleCreate(BaseModel):
    key: str = Field(min_length=2, max_length=80)
    name: str = Field(min_length=2, max_length=120)
    description: str = ""
    permissions: list[str] = Field(default_factory=list)


async def seed_keyed(collection: str, defaults: list[dict]) -> None:
    repo = PlatformRepository(get_db())
    for default in defaults:
        if not await repo.get_by_key(collection, default["key"]):
            await repo.create(collection, default)


@router.get("/content")
async def list_content(_: Annotated[dict, Depends(require_permission("content.read"))]) -> dict:
    await seed_keyed("admin_content", CONTENT_DEFAULTS)
    return {"items": [serialize(item) for item in await PlatformRepository(get_db()).list("admin_content")]}


@router.patch("/content/{key}")
async def update_content(key: str, body: ContentUpdate, admin: Annotated[dict, Depends(require_permission("content.write"))]) -> dict:
    existing = await PlatformRepository(get_db()).get_by_key("admin_content", key)
    if not existing:
        raise HTTPException(status_code=404, detail="Content section not found")
    updated = await PlatformRepository(get_db()).upsert_by_key("admin_content", key, {
        "content": body.content,
        "status": body.status,
        "label": body.label or existing.get("label", key),
        "version": existing.get("version", 0) + 1,
        "published_at": datetime.now(timezone.utc) if body.status == "published" else existing.get("published_at"),
        "updated_by": str(admin["_id"]),
    })
    await AuditRepository(get_db()).record(str(admin["_id"]), "content.update", "content", key, {"status": body.status})
    return serialize(updated)


@public_router.get("/content")
async def published_content() -> dict:
    items = await PlatformRepository(get_db()).list("admin_content", {"status": "published"})
    return {"items": [{"key": item["key"], "content": item.get("content", {}), "version": item.get("version", 1)} for item in items]}


def register_crud(collection: str, path: str, read_permission: str, write_permission: str, defaults: list[dict] | None = None):
    async def list_items(_: Annotated[dict, Depends(require_permission(read_permission))]) -> dict:
        if defaults:
            await seed_keyed(collection, defaults)
        return {"items": [serialize(item) for item in await PlatformRepository(get_db()).list(collection)]}

    async def create_item(body: GenericCreate, admin: Annotated[dict, Depends(require_permission(write_permission))]) -> dict:
        if await PlatformRepository(get_db()).get_by_key(collection, body.key):
            raise HTTPException(status_code=409, detail="Key already exists")
        item = await PlatformRepository(get_db()).create(collection, body.model_dump())
        await AuditRepository(get_db()).record(str(admin["_id"]), f"{path}.create", path, str(item["_id"]))
        return serialize(item)

    async def update_item(item_id: str, body: GenericUpdate, admin: Annotated[dict, Depends(require_permission(write_permission))]) -> dict:
        item = await PlatformRepository(get_db()).update(collection, item_id, body.model_dump(exclude_none=True))
        if not item:
            raise HTTPException(status_code=404, detail="Item not found")
        await AuditRepository(get_db()).record(str(admin["_id"]), f"{path}.update", path, item_id)
        
        # Publish Redis command for live feature flags synchronization
        if collection == "feature_flags":
            from app.control_plane import control_plane
            import asyncio
            asyncio.create_task(
                control_plane.publish_and_wait(
                    command_type="UPDATE_FEATURE_FLAGS",
                    actor_id=str(admin["_id"]),
                    actor_email=admin.get("email", ""),
                    payload={"key": item["key"], "enabled": item.get("enabled", True)}
                )
            )
        return serialize(item)

    async def delete_item(item_id: str, admin: Annotated[dict, Depends(require_permission(write_permission))]) -> dict:
        if not await PlatformRepository(get_db()).delete(collection, item_id):
            raise HTTPException(status_code=404, detail="Item not found")
        await AuditRepository(get_db()).record(str(admin["_id"]), f"{path}.delete", path, item_id)
        return {"status": "deleted", "item_id": item_id}

    router.add_api_route(f"/{path}", list_items, methods=["GET"], name=f"list_{path}")
    router.add_api_route(f"/{path}", create_item, methods=["POST"], name=f"create_{path}", status_code=201)
    router.add_api_route(f"/{path}/{{item_id}}", update_item, methods=["PATCH"], name=f"update_{path}")
    router.add_api_route(f"/{path}/{{item_id}}", delete_item, methods=["DELETE"], name=f"delete_{path}")


register_crud("feature_flags", "feature-flags", "features.read", "features.write", FEATURE_FLAG_DEFAULTS)
register_crud("voice_models", "voices", "voices.read", "voices.write", VOICE_MODEL_DEFAULTS)
register_crud("announcements", "announcements", "announcements.read", "announcements.write", ANNOUNCEMENT_DEFAULTS)


@router.get("/languages")
async def list_languages(_: Annotated[dict, Depends(require_permission("languages.read"))]) -> dict:
    await seed_keyed("platform_languages", LANGUAGE_DEFAULTS)
    return {"items": [serialize(item) for item in await PlatformRepository(get_db()).list("platform_languages")]}


@router.patch("/languages/{code}")
async def update_language(code: str, body: GenericUpdate, admin: Annotated[dict, Depends(require_permission("languages.write"))]) -> dict:
    item = await PlatformRepository(get_db()).upsert_by_key("platform_languages", code, body.model_dump(exclude_none=True))
    await AuditRepository(get_db()).record(str(admin["_id"]), "language.update", "language", code)
    
    # Publish Redis command for live language synchronization
    from app.control_plane import control_plane
    import asyncio
    asyncio.create_task(
        control_plane.publish_and_wait(
            command_type="UPDATE_LANGUAGE",
            actor_id=str(admin["_id"]),
            actor_email=admin.get("email", ""),
            payload={"code": code, "enabled": item.get("enabled", True)}
        )
    )
    return serialize(item)


@public_router.get("/feature-flags")
async def public_feature_flags() -> dict:
    await seed_keyed("feature_flags", FEATURE_FLAG_DEFAULTS)
    rows = await PlatformRepository(get_db()).list("feature_flags")
    return {"features": {row["key"]: row.get("enabled", True) for row in rows}}


@public_router.get("/languages")
async def public_languages() -> dict:
    await seed_keyed("platform_languages", LANGUAGE_DEFAULTS)
    rows = await PlatformRepository(get_db()).list("platform_languages", {"enabled": {"$ne": False}})
    return {"items": [{"code": row.get("code") or row.get("key"), "name": row.get("name"), "translation_enabled": row.get("translation_enabled", True), "stt_enabled": row.get("stt_enabled", True), "tts_enabled": row.get("tts_enabled", True)} for row in rows]}


@router.get("/translation-settings")
async def get_translation_settings(_: Annotated[dict, Depends(require_permission("translation.read"))]) -> dict:
    defaults = {
        "libretranslate_endpoint": "http://127.0.0.1:5000",
        "stt_model": "base", "detection_confidence": 0.72, "cache_timeout_seconds": 3600,
        "translation_timeout_seconds": 8, "retry_count": 2, "maximum_latency_ms": 3500,
        "fallback_language": "en", "segment_silence_ms": 900, "max_segment_seconds": 15, "tts_profile": "natural",
        "auto_play_translated_audio": True,
    }
    item = await PlatformRepository(get_db()).get_by_key("platform_settings", "translation")
    return {"key": "translation", "values": item.get("values", defaults) if item else defaults}


@router.patch("/translation-settings")
async def update_translation_settings(body: SettingsUpdate, admin: Annotated[dict, Depends(require_permission("translation.write"))]) -> dict:
    item = await PlatformRepository(get_db()).upsert_by_key("platform_settings", "translation", {"values": body.values, "updated_by": str(admin["_id"])})
    await AuditRepository(get_db()).record(str(admin["_id"]), "translation_settings.update", "settings", "translation")
    
    # Publish Redis command for live settings synchronization
    from app.control_plane import control_plane
    import asyncio
    asyncio.create_task(
        control_plane.publish_and_wait(
            command_type="UPDATE_SETTINGS",
            actor_id=str(admin["_id"]),
            actor_email=admin.get("email", ""),
            payload={"key": "translation", "values": body.values}
        )
    )
    return serialize(item)


@public_router.get("/translation-settings")
async def public_translation_settings() -> dict:
    item = await PlatformRepository(get_db()).get_by_key("platform_settings", "translation")
    values = item.get("values", {}) if item else {}
    safe_keys = {"cache_timeout_seconds", "translation_timeout_seconds", "retry_count", "maximum_latency_ms", "fallback_language", "segment_silence_ms", "max_segment_seconds", "tts_profile", "auto_play_translated_audio"}
    return {"values": {key: value for key, value in values.items() if key in safe_keys}}


@router.get("/settings")
async def get_settings(_: Annotated[dict, Depends(require_permission("settings.read"))]) -> dict:
    defaults = {
        "product_name": "GiftMe Watch", "support_email": "", "maintenance_mode": False,
        "default_language": "en", "meeting_retention_days": 30, "site_title": "Translation Bot",
        "logo_url": "", "theme": "light", "email_from": "", "oauth_google_enabled": False,
        "jwt_expiration_minutes": 60, "turn_server": "", "stun_server": "stun:stun.l.google.com:19302",
    }
    item = await PlatformRepository(get_db()).get_by_key("platform_settings", "general")
    return {"key": "general", "values": item.get("values", defaults) if item else defaults}


@router.patch("/settings")
async def update_settings(body: SettingsUpdate, admin: Annotated[dict, Depends(require_permission("settings.write"))]) -> dict:
    item = await PlatformRepository(get_db()).upsert_by_key("platform_settings", "general", {"values": body.values, "updated_by": str(admin["_id"])})
    await AuditRepository(get_db()).record(str(admin["_id"]), "settings.update", "settings", "general")
    
    # Publish Redis command for live settings synchronization
    from app.control_plane import control_plane
    import asyncio
    asyncio.create_task(
        control_plane.publish_and_wait(
            command_type="UPDATE_SETTINGS",
            actor_id=str(admin["_id"]),
            actor_email=admin.get("email", ""),
            payload={"key": "general", "values": body.values}
        )
    )
    return serialize(item)


@public_router.get("/settings")
async def public_settings() -> dict:
    item = await PlatformRepository(get_db()).get_by_key("platform_settings", "general")
    values = item.get("values", {}) if item else {}
    public_keys = {"product_name", "support_email", "maintenance_mode", "default_language", "site_title", "logo_url", "theme", "stun_server"}
    return {"values": {key: value for key, value in values.items() if key in public_keys}}


@router.get("/feedback")
async def list_feedback(
    _: Annotated[dict, Depends(require_permission("feedback.read"))],
    status: str | None = None,
    limit: int = Query(100, ge=1, le=500),
) -> dict:
    query = {"status": status} if status else {}
    return {"items": [serialize(item) for item in await PlatformRepository(get_db()).list("feedback", query, limit)]}


@router.post("/feedback", status_code=201)
async def create_feedback(body: FeedbackCreate, admin: Annotated[dict, Depends(require_permission("feedback.write"))]) -> dict:
    item = await PlatformRepository(get_db()).create("feedback", {**body.model_dump(), "status": "new", "replies": []})
    await AuditRepository(get_db()).record(str(admin["_id"]), "feedback.create", "feedback", str(item["_id"]))
    return serialize(item)


@public_router.post("/feedback", status_code=201)
async def submit_feedback(body: FeedbackCreate) -> dict:
    item = await PlatformRepository(get_db()).create("feedback", {**body.model_dump(), "status": "new", "replies": []})
    return {"status": "received", "feedback_id": str(item["_id"])}


@router.patch("/feedback/{feedback_id}")
async def update_feedback(feedback_id: str, body: FeedbackUpdate, admin: Annotated[dict, Depends(require_permission("feedback.write"))]) -> dict:
    changes = body.model_dump(exclude_none=True)
    if body.reply:
        existing = await PlatformRepository(get_db()).update("feedback", feedback_id, changes)
        if not existing:
            raise HTTPException(status_code=404, detail="Feedback not found")
        await get_db()["feedback"].update_one(
            {"_id": existing["_id"]},
            {"$push": {"replies": {"actor_id": str(admin["_id"]), "body": body.reply, "created_at": datetime.now(timezone.utc)}}},
        )
        item = await get_db()["feedback"].find_one({"_id": existing["_id"]})
    else:
        item = await PlatformRepository(get_db()).update("feedback", feedback_id, changes)
    if not item:
        raise HTTPException(status_code=404, detail="Feedback not found")
    await AuditRepository(get_db()).record(str(admin["_id"]), "feedback.update", "feedback", feedback_id)
    return serialize(item)


@router.get("/roles")
async def list_roles(_: Annotated[dict, Depends(require_permission("roles.read"))]) -> dict:
    defaults = [
        {"key": "administrator", "name": "Administrator", "description": "Full platform access", "permissions": sorted(ALL_ADMIN_PERMISSIONS), "system": True},
        {"key": "support", "name": "Support", "description": "User and meeting support", "permissions": ["dashboard.read", "users.read", "meetings.read", "feedback.read", "feedback.write"], "system": True},
        {"key": "content_editor", "name": "Content Editor", "description": "Website content and media", "permissions": ["content.read", "content.write", "media.read", "media.write", "announcements.read", "announcements.write"], "system": True},
    ]
    await seed_keyed("admin_roles", defaults)
    return {"items": [serialize(item) for item in await PlatformRepository(get_db()).list("admin_roles")], "available_permissions": sorted(ALL_ADMIN_PERMISSIONS)}


@router.patch("/roles/{key}")
async def update_role(key: str, body: SettingsUpdate, admin: Annotated[dict, Depends(require_permission("roles.write"))]) -> dict:
    permissions = body.values.get("permissions", [])
    invalid = set(permissions) - ALL_ADMIN_PERMISSIONS
    if invalid:
        raise HTTPException(status_code=400, detail=f"Unknown permissions: {', '.join(sorted(invalid))}")
    item = await PlatformRepository(get_db()).upsert_by_key("admin_roles", key, body.values)
    await AuditRepository(get_db()).record(str(admin["_id"]), "role.update", "admin_role", key)
    return serialize(item)


@router.post("/roles", status_code=201)
async def create_role(body: RoleCreate, admin: Annotated[dict, Depends(require_permission("roles.write"))]) -> dict:
    invalid = set(body.permissions) - ALL_ADMIN_PERMISSIONS
    if invalid:
        raise HTTPException(status_code=400, detail=f"Unknown permissions: {', '.join(sorted(invalid))}")
    if await PlatformRepository(get_db()).get_by_key("admin_roles", body.key):
        raise HTTPException(status_code=409, detail="Role key already exists")
    item = await PlatformRepository(get_db()).create("admin_roles", body.model_dump())
    await AuditRepository(get_db()).record(str(admin["_id"]), "role.create", "admin_role", body.key)
    return serialize(item)


@router.delete("/roles/{key}")
async def delete_role(key: str, admin: Annotated[dict, Depends(require_permission("roles.write"))]) -> dict:
    item = await PlatformRepository(get_db()).get_by_key("admin_roles", key)
    if not item:
        raise HTTPException(status_code=404, detail="Role not found")
    if item.get("system"):
        raise HTTPException(status_code=400, detail="System roles cannot be deleted")
    await get_db()["admin_roles"].delete_one({"key": key})
    await AuditRepository(get_db()).record(str(admin["_id"]), "role.delete", "admin_role", key)
    return {"status": "deleted", "key": key}


@router.get("/analytics")
async def analytics(_: Annotated[dict, Depends(require_permission("analytics.read"))]) -> dict:
    db = get_db()
    language_rows = await db["users"].aggregate([
        {"$match": {"deleted_at": {"$exists": False}}},
        {"$group": {"_id": "$preferred_language", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]).to_list(length=100)
    role_rows = await db["users"].aggregate([
        {"$match": {"deleted_at": {"$exists": False}}},
        {"$group": {"_id": "$role", "count": {"$sum": 1}}},
    ]).to_list(length=20)
    return {
        "status": "operational",
        "users_by_language": [{"label": row["_id"] or "unknown", "value": row["count"]} for row in language_rows],
        "users_by_role": [{"label": row["_id"] or "unknown", "value": row["count"]} for row in role_rows],
        "totals": {
            "users": await db["users"].count_documents({"deleted_at": {"$exists": False}}),
            "rooms": await db["rooms"].count_documents({}),
            "messages": await db["messages"].count_documents({}),
            "translation_events": await db["translation_logs"].count_documents({}),
        },
    }


@router.post("/languages/sync")
async def sync_languages(admin: Annotated[dict, Depends(require_permission("languages.write"))]) -> dict:
    db = get_db()
    platform_repo = PlatformRepository(db)
    settings_item = await platform_repo.get_by_key("platform_settings", "translation")
    endpoint = "http://127.0.0.1:5000"
    if settings_item and "values" in settings_item:
        endpoint = settings_item["values"].get("libretranslate_endpoint", endpoint)

    import httpx
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{endpoint.rstrip('/')}/languages", timeout=5.0)
            if response.status_code != 200:
                raise HTTPException(status_code=502, detail=f"LibreTranslate returned status {response.status_code}")
            languages_data = response.json()
    except Exception as e:
        languages_data = [
            {"code": "en", "name": "English"},
            {"code": "hi", "name": "Hindi"},
            {"code": "de", "name": "German"},
            {"code": "es", "name": "Spanish"},
            {"code": "fr", "name": "French"},
            {"code": "ar", "name": "Arabic"},
            {"code": "nl", "name": "Dutch"},
            {"code": "it", "name": "Italian"},
            {"code": "pt", "name": "Portuguese"},
            {"code": "ru", "name": "Russian"},
        ]

    imported = 0
    for lang in languages_data:
        code = lang.get("code")
        name = lang.get("name")
        if not code or not name:
            continue
        
        existing = await platform_repo.get_by_key("platform_languages", code)
        if not existing:
            flag_map = {
                "en": "US", "hi": "IN", "de": "DE", "es": "ES", "fr": "FR",
                "ar": "EG", "nl": "NL", "it": "IT", "pt": "BR", "ru": "RU",
                "zh": "CN", "ja": "JP", "ko": "KR", "tr": "TR", "pl": "PL"
            }
            flag = flag_map.get(code, code.upper()[:2])
            
            await platform_repo.create("platform_languages", {
                "key": code,
                "code": code,
                "name": name,
                "native_name": name,
                "flag": flag,
                "enabled": True,
                "stt_enabled": True,
                "translation_enabled": True,
                "tts_enabled": True
            })
            imported += 1
            
    await AuditRepository(db).record(str(admin["_id"]), "languages.sync", "languages", "all", {"imported": imported})
    
    from app.control_plane import control_plane
    import asyncio
    asyncio.create_task(
        control_plane.publish_and_wait(
            command_type="UPDATE_SETTINGS",
            actor_id=str(admin["_id"]),
            actor_email=admin.get("email", ""),
            payload={"key": "languages_sync", "values": {}}
        )
    )
    return {"status": "success", "imported_count": imported}


@router.post("/voices/scan")
async def scan_voices(admin: Annotated[dict, Depends(require_permission("voices.write"))]) -> dict:
    db = get_db()
    platform_repo = PlatformRepository(db)
    
    import json
    from pathlib import Path
    
    admin_backend_dir = Path(__file__).resolve().parents[2]
    piper_dir = (admin_backend_dir.parent / "backend" / "models" / "piper").resolve()
    
    if not piper_dir.exists():
        piper_dir = Path("./backend/models/piper").resolve()
        
    voices = []
    if piper_dir.exists():
        for file in piper_dir.glob("*.onnx"):
            config_file = file.with_name(f"{file.name}.json")
            if not config_file.exists():
                config_file = file.with_suffix(".json")
            
            gender = "neutral"
            language_code = "en"
            native_name = "Unknown"
            quality = "medium"
            dataset = file.stem
            
            if config_file.exists():
                try:
                    with open(config_file, "r", encoding="utf-8") as f:
                        config_data = json.load(f)
                        audio = config_data.get("audio", {})
                        quality = audio.get("quality", "medium")
                        lang = config_data.get("language", {})
                        language_code = lang.get("code") or lang.get("family") or "en"
                        if "-" in language_code or "_" in language_code:
                            language_code = language_code.replace("_", "-").split("-")[0]
                        native_name = lang.get("name_native") or lang.get("name_english") or "Unknown"
                        dataset = config_data.get("dataset") or file.stem
                except Exception as e:
                    pass
            
            filename_lower = file.name.lower()
            if any(name in filename_lower for name in ["amy", "paola", "irina", "siwis"]):
                gender = "feminine"
            elif any(name in filename_lower for name in ["ryan", "thorsten", "kareem", "pratham", "faber"]):
                gender = "masculine"
            else:
                gender = "neutral"
                
            voices.append({
                "key": file.stem,
                "name": f"{dataset.capitalize()} ({quality})",
                "description": f"Piper voice model for {native_name}",
                "enabled": True,
                "metadata": {
                    "language": language_code,
                    "gender": gender,
                    "model_path": f"models/piper/{file.name}",
                    "config_path": f"models/piper/{config_file.name}",
                    "quality": quality,
                    "size_bytes": file.stat().st_size,
                    "installed": True
                }
            })
            
    imported = 0
    for voice in voices:
        existing = await platform_repo.get_by_key("voice_models", voice["key"])
        if not existing:
            await platform_repo.create("voice_models", voice)
            imported += 1
        else:
            await db["voice_models"].update_one(
                {"key": voice["key"]},
                {"$set": {
                    "metadata.size_bytes": voice["metadata"]["size_bytes"],
                    "metadata.installed": True
                }}
            )
            
    await AuditRepository(db).record(str(admin["_id"]), "voices.scan", "voices", "all", {"imported": imported})
    
    from app.control_plane import control_plane
    import asyncio
    asyncio.create_task(
        control_plane.publish_and_wait(
            command_type="UPDATE_SETTINGS",
            actor_id=str(admin["_id"]),
            actor_email=admin.get("email", ""),
            payload={"key": "voices_scan", "values": {}}
        )
    )
    return {"status": "success", "imported_count": imported, "total_scanned": len(voices)}


class VoiceRoutingUpdate(BaseModel):
    routing: dict[str, dict[str, str]]


@router.post("/voices/routing")
async def update_voice_routing(body: VoiceRoutingUpdate, admin: Annotated[dict, Depends(require_permission("voices.write"))]) -> dict:
    db = get_db()
    platform_repo = PlatformRepository(db)
    item = await platform_repo.upsert_by_key(
        "platform_settings",
        "voice_routing",
        {"values": body.routing, "updated_by": str(admin["_id"])}
    )
    await AuditRepository(db).record(str(admin["_id"]), "voices.routing.update", "voices", "routing", body.routing)
    
    from app.control_plane import control_plane
    import asyncio
    asyncio.create_task(
        control_plane.publish_and_wait(
            command_type="UPDATE_SETTINGS",
            actor_id=str(admin["_id"]),
            actor_email=admin.get("email", ""),
            payload={"key": "voice_routing", "values": body.routing}
        )
    )
    return serialize(item)


@public_router.get("/voices/routing")
async def get_voice_routing() -> dict:
    db = get_db()
    platform_repo = PlatformRepository(db)
    item = await platform_repo.get_by_key("platform_settings", "voice_routing")
    return {"routing": item.get("values", {}) if item else {}}


class TranslationModeCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    preferred_terminology: dict[str, str] = Field(default_factory=dict)
    translation_prompt: str | None = Field(default=None, max_length=1000)
    glossary: dict[str, str] = Field(default_factory=dict)
    llm_config: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True


class TranslationModeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    preferred_terminology: dict[str, str] | None = None
    translation_prompt: str | None = Field(default=None, max_length=1000)
    glossary: dict[str, str] | None = None
    llm_config: dict[str, Any] | None = None
    enabled: bool | None = None


async def seed_translation_modes(db) -> None:
    if await db["translation_modes"].count_documents({}) == 0:
        defaults = [
            {"name": "General", "description": "Standard translation settings for general conversation.", "enabled": True},
            {"name": "Business", "description": "Optimized for corporate negotiations, meetings, and business terms.", "enabled": True},
            {"name": "Education", "description": "Tailored for classroom learning, lectures, and academic terminology.", "enabled": True},
            {"name": "Medical", "description": "Configured for healthcare providers, clinical settings, and patient interactions.", "enabled": True},
            {"name": "Legal", "description": "Optimized for legal terms, courtroom proceedings, and client consultations.", "enabled": True},
            {"name": "Technical", "description": "Tailored for engineering discussion, software development, and specialized terminology.", "enabled": True},
            {"name": "Customer Support", "description": "Optimized for helpdesk queries, ticket resolutions, and user relations.", "enabled": True},
            {"name": "Interview", "description": "Configured for job interviews, candidate assessments, and professional screenings.", "enabled": True},
            {"name": "Conference", "description": "Designed for large-scale multi-speaker events and presentations.", "enabled": True},
        ]
        for item in defaults:
            item["preferred_terminology"] = {}
            item["translation_prompt"] = f"Translate in a {item['name'].lower()} context."
            item["glossary"] = {}
            item["llm_config"] = {}
            item["created_at"] = datetime.utcnow()
            await db["translation_modes"].insert_one(item)


@router.get("/translation-modes")
async def list_translation_modes(
    _: Annotated[dict, Depends(require_permission("translation.read"))],
) -> dict:
    db = get_db()
    await seed_translation_modes(db)
    rows = await db["translation_modes"].find({}).sort("name", 1).to_list(length=100)
    return {"items": [serialize(row) for row in rows]}


@router.post("/translation-modes", status_code=201)
async def create_translation_mode(
    body: TranslationModeCreate,
    admin: Annotated[dict, Depends(require_permission("translation.write"))],
) -> dict:
    db = get_db()
    existing = await db["translation_modes"].find_one({"name": {"$regex": f"^{re.escape(body.name)}$", "$options": "i"}})
    if existing:
        raise HTTPException(status_code=409, detail="A translation mode with this name already exists")
    
    doc = body.model_dump()
    doc["created_at"] = datetime.utcnow()
    res = await db["translation_modes"].insert_one(doc)
    doc["_id"] = res.inserted_id
    
    await AuditRepository(db).record(str(admin["_id"]), "translation_mode.create", "translation_mode", str(res.inserted_id), {"name": body.name})
    return serialize(doc)


@router.patch("/translation-modes/{mode_id}")
async def update_translation_mode(
    mode_id: str,
    body: TranslationModeUpdate,
    admin: Annotated[dict, Depends(require_permission("translation.write"))],
) -> dict:
    db = get_db()
    try:
        oid = ObjectId(mode_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid mode ID format")
        
    existing = await db["translation_modes"].find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Translation mode not found")
        
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if updates:
        if "name" in updates:
            dup = await db["translation_modes"].find_one({"name": {"$regex": f"^{re.escape(updates['name'])}$", "$options": "i"}, "_id": {"$ne": oid}})
            if dup:
                raise HTTPException(status_code=409, detail="A translation mode with this name already exists")
        await db["translation_modes"].update_one({"_id": oid}, {"$set": updates})
        existing.update(updates)
        
    await AuditRepository(db).record(str(admin["_id"]), "translation_mode.update", "translation_mode", mode_id, updates)
    return serialize(existing)


@router.delete("/translation-modes/{mode_id}", status_code=204)
async def delete_translation_mode(
    mode_id: str,
    admin: Annotated[dict, Depends(require_permission("translation.write"))],
) -> None:
    db = get_db()
    try:
        oid = ObjectId(mode_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid mode ID format")
        
    res = await db["translation_modes"].delete_one({"_id": oid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Translation mode not found")
        
    await AuditRepository(db).record(str(admin["_id"]), "translation_mode.delete", "translation_mode", mode_id)


@public_router.get("/translation-modes")
async def get_public_modes() -> dict:
    db = get_db()
    await seed_translation_modes(db)
    rows = await db["translation_modes"].find({"enabled": {"$ne": False}}).sort("name", 1).to_list(length=100)
    return {"items": [{"name": row["name"], "description": row.get("description", "")} for row in rows]}


class GlossaryEntrySchema(BaseModel):
    source_term: str = Field(..., min_length=1)
    target_term: str = Field(..., min_length=1)
    language: str = Field(..., min_length=2, max_length=10)
    industry: str = "General"
    priority: int = 1
    case_sensitive: bool = False
    notes: str | None = None
    enabled: bool = True


@router.get("/platform/glossary")
async def get_admin_glossary(
    admin: Annotated[dict, Depends(require_permission("platform.read"))],
) -> dict:
    from app.repositories.glossary_repository import GlossaryRepository
    db = get_db()
    repo = GlossaryRepository(db)
    items = await repo.list_all()
    return {"items": items}


@router.post("/platform/glossary")
async def save_admin_glossary(
    entry: GlossaryEntrySchema,
    admin: Annotated[dict, Depends(require_permission("platform.write"))],
) -> dict:
    from app.repositories.glossary_repository import GlossaryRepository
    db = get_db()
    repo = GlossaryRepository(db)
    doc = await repo.save(
        source_term=entry.source_term,
        target_term=entry.target_term,
        language=entry.language,
        industry=entry.industry,
        priority=entry.priority,
        case_sensitive=entry.case_sensitive,
        notes=entry.notes,
        enabled=entry.enabled,
    )
    await AuditRepository(db).record(str(admin["_id"]), "glossary.save", "glossary", doc["_id"])
    return {"status": "success", "item": doc}


@router.delete("/platform/glossary/{entry_id}")
async def delete_admin_glossary(
    entry_id: str,
    admin: Annotated[dict, Depends(require_permission("platform.write"))],
) -> None:
    from app.repositories.glossary_repository import GlossaryRepository
    db = get_db()
    repo = GlossaryRepository(db)
    success = await repo.delete(entry_id)
    if not success:
        raise HTTPException(status_code=404, detail="Glossary entry not found or invalid format")
    await AuditRepository(db).record(str(admin["_id"]), "glossary.delete", "glossary", entry_id)


