"""Read-only infrastructure reference for the admin console.

Deliberately reference-only: it surfaces what this admin-backend process's
own configuration and the known deployment topology look like, but never
edits Docker, Caddy, or the .env files, and never returns a secret value --
only whether a secret has been changed from its placeholder default. There
is no live Docker socket access here and no attempt to add one; "manage
Docker services" per the Phase 2 spec is satisfied as a reference panel,
not a live control plane, on purpose.
"""

import asyncio
import time
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends

from app.config import get_settings
from app.database import get_db
from app.routers.system import probe
from app.security import require_permission

router = APIRouter(prefix="/api/admin/infrastructure", tags=["admin-infrastructure"])

_PLACEHOLDER_MARKERS = ("replace-with", "change-this", "use-the-same-long-secret")


def _is_customized(value: str) -> bool:
    lowered = value.lower()
    return bool(value) and not any(marker in lowered for marker in _PLACEHOLDER_MARKERS)


async def _mongo_health() -> dict:
    started = time.perf_counter()
    try:
        await get_db().command("ping")
        return {"name": "MongoDB", "status": "healthy", "latency_ms": round((time.perf_counter() - started) * 1000)}
    except Exception as exc:
        return {"name": "MongoDB", "status": "unavailable", "latency_ms": None, "detail": str(exc)}


async def _turn_health(settings) -> dict:
    try:
        async with httpx.AsyncClient(timeout=3.0, verify=settings.HEALTH_VERIFY_TLS) as client:
            response = await client.get(f"{settings.PUBLIC_BACKEND_URL.rstrip('/')}/api/internal/turn-status")
            data = response.json() if response.status_code == 200 else {}
    except Exception:
        data = {}
    if not data.get("configured"):
        return {"name": "coturn (TURN/STUN)", "status": "not_configured", "detail": "TURN_HOST is not set on the public backend"}
    status = "healthy" if data.get("reachable") else "unavailable"
    return {"name": "coturn (TURN/STUN)", "status": status, "detail": f"{data.get('host')}:{data.get('port')}"}


@router.get("/health")
async def infrastructure_health(
    _: Annotated[dict, Depends(require_permission("system.read"))],
) -> dict:
    """Live reachability checks -- everything that can actually be checked
    without a Docker socket or Caddy admin API (neither of which this
    service has access to, by design; see the module docstring)."""
    settings = get_settings()
    checked = await asyncio.gather(
        _mongo_health(),
        _turn_health(settings),
        probe("LibreTranslate", f"{settings.LIBRETRANSLATE_URL.rstrip('/')}/languages"),
        probe("Whisper (STT)", f"{settings.PUBLIC_BACKEND_URL.rstrip('/')}/stt/status"),
        probe("Piper (TTS)", f"{settings.PUBLIC_BACKEND_URL.rstrip('/')}/tts/status"),
    )
    return {
        "checked": checked,
        "not_inspectable": [
            {"name": "Docker daemon", "detail": "No Docker socket is mounted into this service; container status can't be queried from here. Use `docker compose ps` on the host."},
            {"name": "Caddy", "detail": "No Caddy admin API is exposed to this service. If this request reached the admin console at all in production, Caddy successfully routed it."},
        ],
    }


@router.get("")
async def infrastructure_reference(_: Annotated[dict, Depends(require_permission("system.read"))]) -> dict:
    settings = get_settings()

    return {
        "services": [
            {"name": "backend", "role": "Public API + WebSocket signaling + translation pipeline", "port": 8000, "image": "backend"},
            {"name": "admin-backend", "role": "Admin API + CMS + control-plane publisher", "port": 8010, "image": "admin-backend"},
            {"name": "frontend", "role": "Public React SPA, served by nginx", "port": 80, "image": "frontend"},
            {"name": "admin-frontend", "role": "Admin console React SPA, served by nginx", "port": 80, "image": "admin-frontend"},
            {"name": "caddy", "role": "Reverse proxy + automatic HTTPS (Let's Encrypt)", "port": None, "image": "caddy:2.11.4-alpine"},
            {"name": "mongodb", "role": "Shared primary database", "port": 27017, "image": "mongo:7.0"},
            {"name": "coturn", "role": "Self-hosted TURN/STUN relay for WebRTC NAT traversal", "port": 3478, "image": "coturn/coturn:4.14.0"},
            {"name": "libretranslate", "role": "Self-hosted machine translation engine", "port": 5000, "image": "libretranslate/libretranslate:v1.9.6"},
        ],
        "caddy_routes": [
            {"host": "giftme.watch", "proxies_to": "frontend:80", "notes": "Public site; sends security headers incl. X-Frame-Options: SAMEORIGIN"},
            {"host": "api.giftme.watch", "proxies_to": "backend:8000", "notes": "Public API + WebSocket + TURN client hostname"},
            {"host": "admin.giftme.watch", "proxies_to": "admin-backend:8010 (/api/*, /admin-media/*) or admin-frontend:80 (else)", "notes": "Admin console"},
        ],
        "turn_stun": {
            "note": "TURN configuration lives on the public backend's own settings, not this service's -- shown here as the deployment-documented shape, not a live read.",
            "expected_env": ["TURN_HOST", "TURN_PORT", "TURN_EXTERNAL_IP", "TURN_SHARED_SECRET", "TURN_CREDENTIAL_TTL_SECONDS"],
            "default_stun_fallback": "stun:stun.l.google.com:19302",
            "required_firewall_ports": ["TCP+UDP 3478 (TURN client traffic)", "UDP 49160-49200 (TURN relayed media)"],
        },
        "environment": {
            "public_backend_url": settings.PUBLIC_BACKEND_URL,
            "libretranslate_url": settings.LIBRETRANSLATE_URL,
            "media_root": settings.MEDIA_ROOT,
            "max_upload_mb": settings.MAX_UPLOAD_MB,
            "admin_frontend_origins": settings.frontend_origins,
            "public_content_origins": [o.strip() for o in settings.PUBLIC_CONTENT_ORIGINS.split(",") if o.strip()],
            "health_verify_tls": settings.HEALTH_VERIFY_TLS,
        },
        "secrets_configured": {
            "ADMIN_JWT_SECRET": _is_customized(settings.ADMIN_JWT_SECRET),
            "CONTROL_PLANE_SECRET": _is_customized(settings.CONTROL_PLANE_SECRET),
            "CMS_PREVIEW_SECRET": _is_customized(settings.CMS_PREVIEW_SECRET),
            "ADMIN_BOOTSTRAP_CODE": _is_customized(settings.ADMIN_BOOTSTRAP_CODE),
        },
        "feature_flags_route": "/admin/feature-flags",
    }
