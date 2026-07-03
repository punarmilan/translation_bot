from datetime import datetime, timezone
from typing import Annotated

from bson import ObjectId
from fastapi import APIRouter, Depends

from app.database import get_db
from app.security import require_admin

router = APIRouter(prefix="/admin/dashboard", tags=["dashboard"])


def json_value(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, dict):
        return {key: json_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [json_value(item) for item in value]
    return value


def serialize(document: dict) -> dict:
    return {key: json_value(value) for key, value in document.items() if key != "password_hash"}


@router.get("")
async def dashboard(_: Annotated[dict, Depends(require_admin)]) -> dict:
    db = get_db()
    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    total_users = await db["users"].count_documents({"deleted_at": {"$exists": False}})
    online_users = await db["users"].count_documents({"is_online": True, "deleted_at": {"$exists": False}})
    meetings_today = await db["rooms"].count_documents({"created_at": {"$gte": start.replace(tzinfo=None)}})
    active_meetings = await db["rooms"].count_documents({"is_active": True})
    translated_messages = await db["messages"].count_documents({})
    translation_requests = await db["translation_logs"].count_documents({})
    recent_signups = await db["users"].find({}, {"password_hash": 0}).sort("created_at", -1).limit(5).to_list(length=5)
    recent_meetings = await db["rooms"].find({}).sort("created_at", -1).limit(5).to_list(length=5)
    recent_errors = await db["translation_logs"].find({"translation_success": False}).sort("timestamp", -1).limit(5).to_list(length=5)
    return {
        "metrics": {
            "total_users": total_users,
            "online_users": online_users,
            "meetings_today": meetings_today,
            "active_meetings": active_meetings,
            "messages_translated": translated_messages,
            "voice_minutes": None,
            "translation_requests": translation_requests,
            "average_latency_ms": None,
            "countries_connected": None,
            "supported_languages": 10,
        },
        "metric_notes": {
            "voice_minutes": "Pending media usage persistence",
            "average_latency_ms": "Pending analytics backend",
            "countries_connected": "Pending privacy-safe location analytics",
        },
        "recent_signups": [serialize(item) for item in recent_signups],
        "recent_meetings": [serialize(item) for item in recent_meetings],
        "recent_errors": [serialize(item) for item in recent_errors],
    }
