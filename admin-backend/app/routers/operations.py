from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends

from app.database import get_db
from app.repositories.audit_repository import AuditRepository
from app.security import require_admin

router = APIRouter(prefix="/admin", tags=["admin-operations"])

PLANNED_MODULES = {
    "content": "Content management is planned for a later milestone.",
    "media": "Media upload and asset management are planned for a later milestone.",
    "languages": "Language catalog management is read-only until provider configuration is centralized.",
    "voices": "Voice model uploads and model lifecycle management are planned for a later milestone.",
    "analytics": "The analytics backend is planned; dashboard placeholder charts use persisted operational counts only.",
    "feedback": "Feedback collection and triage are planned for a later milestone.",
    "announcements": "Announcements are planned for a later milestone.",
    "settings": "Centralized settings and feature flags are planned for a later milestone.",
}


@router.get("/languages")
async def languages(_: Annotated[dict, Depends(require_admin)]) -> dict:
    return {
        "status": "read_only",
        "items": [
            {"code": code, "name": name, "enabled": True}
            for code, name in [
                ("en", "English"), ("hi", "Hindi"), ("de", "German"), ("es", "Spanish"),
                ("fr", "French"), ("ar", "Arabic"), ("nl", "Dutch"), ("it", "Italian"),
                ("pt", "Portuguese"), ("ru", "Russian"),
            ]
        ],
        "note": PLANNED_MODULES["languages"],
    }


@router.get("/voices")
async def voices(_: Annotated[dict, Depends(require_admin)]) -> dict:
    return {"status": "planned", "items": [], "note": PLANNED_MODULES["voices"]}


def planned_endpoint(module_name: str):
    async def placeholder(_: Annotated[dict, Depends(require_admin)]) -> dict:
        return {"status": "planned", "items": [], "note": PLANNED_MODULES[module_name]}

    return placeholder


for module in ["content", "media", "analytics", "feedback", "announcements", "settings"]:
    router.add_api_route(
        f"/{module}",
        planned_endpoint(module),
        methods=["GET"],
        name=f"admin_{module}",
    )


@router.get("/system")
async def system_health(_: Annotated[dict, Depends(require_admin)]) -> dict:
    db = get_db()
    await db.command("ping")
    return {
        "status": "operational",
        "services": {
            "admin_api": "healthy",
            "mongodb": "healthy",
            "public_api": "external",
            "translation": "external",
            "speech_recognition": "external",
            "voice_synthesis": "external",
        },
        "checked_at": datetime.utcnow().isoformat(),
    }


@router.get("/logs")
async def audit_logs(_: Annotated[dict, Depends(require_admin)], limit: int = 100) -> dict:
    rows = await AuditRepository(get_db()).list(min(max(limit, 1), 500))
    return {
        "items": [
            {
                **{key: value for key, value in row.items() if key != "_id"},
                "log_id": str(row["_id"]),
                "timestamp": row.get("timestamp").isoformat() if isinstance(row.get("timestamp"), datetime) else row.get("timestamp"),
            }
            for row in rows
        ]
    }
