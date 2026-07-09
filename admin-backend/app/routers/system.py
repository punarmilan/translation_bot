import asyncio
import csv
import io
import shutil
import time
from datetime import datetime, timezone
from typing import Annotated

import httpx
import psutil
from fastapi import APIRouter, Depends, Query, Response
from redis.asyncio import Redis

from app.config import get_settings
from app.database import get_db
from app.repositories.audit_repository import AuditRepository
from app.security import require_permission
from app.serialization import serialize

router = APIRouter(prefix="/api/admin", tags=["admin-observability"])
STARTED_AT = time.time()


async def probe(name: str, url: str) -> dict:
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=2.5, verify=get_settings().HEALTH_VERIFY_TLS) as client:
            response = await client.get(url)
        status = "healthy" if response.status_code < 500 else "degraded"
        detail = f"HTTP {response.status_code}"
    except Exception:
        status, detail = "unavailable", "Connection failed"
    return {"name": name, "status": status, "latency_ms": round((time.perf_counter() - started) * 1000), "detail": detail}


@router.get("/system")
async def system_health(_: Annotated[dict, Depends(require_permission("system.read"))]) -> dict:
    settings = get_settings()
    mongo_started = time.perf_counter()
    try:
        await get_db().command("ping")
        mongo = {"name": "MongoDB", "status": "healthy", "latency_ms": round((time.perf_counter() - mongo_started) * 1000)}
    except Exception:
        mongo = {"name": "MongoDB", "status": "unavailable", "latency_ms": None}
    redis_started = time.perf_counter()
    try:
        redis = Redis.from_url(settings.REDIS_URL, encoding="utf-8", decode_responses=True)
        await redis.ping()
        info = await redis.info()
        redis_service = {
            "name": "Redis",
            "status": "healthy",
            "latency_ms": round((time.perf_counter() - redis_started) * 1000),
            "detail": f"{info.get('connected_clients', 0)} clients",
        }
        await redis.aclose()
    except Exception as exc:
        redis_service = {"name": "Redis", "status": "unavailable", "latency_ms": None, "detail": str(exc)}
    probes = await asyncio.gather(
        probe("FastAPI", f"{settings.PUBLIC_BACKEND_URL.rstrip('/')}/"),
        probe("WebSocket transport", f"{settings.PUBLIC_BACKEND_URL.rstrip('/')}/"),
        probe("LibreTranslate", f"{settings.LIBRETRANSLATE_URL.rstrip('/')}/languages"),
        probe("Whisper", f"{settings.PUBLIC_BACKEND_URL.rstrip('/')}/stt/status"),
        probe("Piper", f"{settings.PUBLIC_BACKEND_URL.rstrip('/')}/tts/status"),
    )
    disk = shutil.disk_usage(".")
    network = psutil.net_io_counters()
    return {
        "status": "operational" if mongo["status"] == "healthy" else "degraded",
        "services": [{"name": "Admin FastAPI", "status": "healthy", "latency_ms": 0, "detail": "Current request"}, mongo, redis_service, *probes],
        "resources": {
            "cpu_percent": psutil.cpu_percent(interval=None),
            "ram_percent": psutil.virtual_memory().percent,
            "ram_used_bytes": psutil.virtual_memory().used,
            "disk_percent": round((disk.used / disk.total) * 100, 1),
            "disk_free_bytes": disk.free,
            "network_sent_bytes": network.bytes_sent,
            "network_received_bytes": network.bytes_recv,
            "queue_length": await get_db()["admin_commands"].count_documents({"status": "queued"}),
            "connected_users": await get_db()["users"].count_documents({"is_online": True, "deleted_at": {"$exists": False}}),
            "uptime_seconds": round(time.time() - STARTED_AT),
        },
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/logs")
async def audit_logs(
    _: Annotated[dict, Depends(require_permission("audit.read"))],
    limit: int = Query(100, ge=1, le=500),
    search: str = "",
    action: str | None = None,
) -> dict:
    return {"items": [serialize(row) for row in await AuditRepository(get_db()).list(limit, search, action)]}


@router.get("/logs/export.csv")
async def export_audit_logs(
    _: Annotated[dict, Depends(require_permission("audit.read"))],
    search: str = "",
    action: str | None = None,
) -> Response:
    rows = [serialize(row) for row in await AuditRepository(get_db()).list(500, search, action)]
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["timestamp", "actor_id", "action", "target_type", "target_id", "metadata"])
    writer.writeheader()
    for row in rows:
        writer.writerow({key: row.get(key, "") for key in writer.fieldnames})
    return Response(
        output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=admin-audit-logs.csv"},
    )
