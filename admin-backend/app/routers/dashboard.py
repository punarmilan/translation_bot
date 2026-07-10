from datetime import datetime, timedelta, timezone
from typing import Annotated

from bson import ObjectId
from fastapi import APIRouter, Depends

from app.database import get_db
from app.security import require_permission

router = APIRouter(prefix="/api/admin/dashboard", tags=["dashboard"])


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
async def dashboard(_: Annotated[dict, Depends(require_permission("dashboard.read"))]) -> dict:
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
    language_rows = await db["users"].aggregate([
        {"$match": {"deleted_at": {"$exists": False}}},
        {"$group": {"_id": "$preferred_language", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]).to_list(length=25)
    day_starts = [start - timedelta(days=days_ago) for days_ago in range(13, -1, -1)]
    daily_usage = []
    for day_start in day_starts:
        day_end = day_start + timedelta(days=1)
        day_start_naive = day_start.replace(tzinfo=None)
        day_end_naive = day_end.replace(tzinfo=None)
        daily_usage.append({
            "date": day_start.date().isoformat(),
            "users": await db["users"].count_documents({"created_at": {"$gte": day_start_naive, "$lt": day_end_naive}}),
            "meetings": await db["rooms"].count_documents({"created_at": {"$gte": day_start_naive, "$lt": day_end_naive}}),
            "translations": await db["translation_logs"].count_documents({"timestamp": {"$gte": day_start_naive, "$lt": day_end_naive}}),
        })
    latency_rows = await db["translation_logs"].aggregate([
        {"$match": {"latency_ms": {"$type": "number"}}},
        {"$group": {"_id": None, "average": {"$avg": "$latency_ms"}}},
    ]).to_list(length=1)
    avg_latency = round(latency_rows[0]["average"]) if latency_rows else None
    enabled_languages = await db["platform_languages"].count_documents({"enabled": {"$ne": False}})

    # Calculate voice minutes from all rooms
    voice_sum_rows = await db["rooms"].aggregate([
        {"$group": {"_id": None, "total_seconds": {"$sum": "$voice_seconds"}}}
    ]).to_list(length=1)
    voice_seconds = voice_sum_rows[0]["total_seconds"] if voice_sum_rows else 0
    voice_minutes = round(voice_seconds / 60, 2)

    # Calculate connected countries count from participants country field
    country_rows = await db["rooms"].distinct("participants.country")
    countries_connected = len([c for c in country_rows if c])

    return {
        "metrics": {
            "total_users": total_users,
            "online_users": online_users,
            "meetings_today": meetings_today,
            "active_meetings": active_meetings,
            "messages_translated": translated_messages,
            "voice_minutes": voice_minutes,
            "translation_requests": translation_requests,
            "average_latency_ms": avg_latency,
            "countries_connected": countries_connected,
            "supported_languages": enabled_languages or 10,
        },
        "metric_notes": {},
        "recent_signups": [serialize(item) for item in recent_signups],
        "recent_meetings": [serialize(item) for item in recent_meetings],
        "recent_errors": [serialize(item) for item in recent_errors],
        "charts": {
            "daily_usage": daily_usage,
            "languages": [{"label": row["_id"] or "unknown", "value": row["count"]} for row in language_rows],
        },
    }
