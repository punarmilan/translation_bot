from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.auth.router import router as auth_router
from app.config import get_settings
from app.database import connect_db, disconnect_db, get_db
from app.repositories.message_repository import MessageRepository
from app.repositories.room_repository import RoomRepository
from app.repositories.translation_log_repository import TranslationLogRepository
from app.repositories.user_repository import UserRepository
from app.routes import manager as websocket_manager
from app.routes import router as websocket_router
from app.control_consumer import ControlConsumer



@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    db = get_db()
    await UserRepository(db).create_indexes()
    await RoomRepository(db).create_indexes()
    await MessageRepository(db).create_indexes()
    await TranslationLogRepository(db).create_indexes()
    
    # Load settings from MongoDB
    from app.runtime_settings import runtime_settings
    await runtime_settings.load_from_db(db)

    from app.tts.service import tts_service
    await tts_service.initialize()

    app.state.control_consumer = ControlConsumer(websocket_manager)
    app.state.control_consumer.start()
    yield
    await app.state.control_consumer.stop()
    await tts_service.close()
    await disconnect_db()


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response


class StrictOriginMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if request.url.path.startswith("/api") and request.method not in {"GET", "HEAD", "OPTIONS"}:
            origin = request.headers.get("origin")
            if not origin or origin not in get_settings().frontend_origins:
                return JSONResponse({"detail": "Untrusted or missing Origin header"}, status_code=403)
        return await call_next(request)


app = FastAPI(
    title="VOXO — Real-Time Multilingual Platform",
    description="Production-ready multilingual communication platform",
    lifespan=lifespan,
)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(StrictOriginMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().frontend_origins,
    allow_origin_regex=get_settings().CORS_ORIGIN_REGEX or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from pathlib import Path
from fastapi.staticfiles import StaticFiles

app.include_router(auth_router)
app.include_router(auth_router, prefix="/api", include_in_schema=False)
app.include_router(websocket_router)

# Mount admin media folder so user frontend can fetch dynamic assets
media_root = Path("../admin-backend/uploads/media").resolve()
if media_root.exists():
    app.mount("/admin-media", StaticFiles(directory=media_root), name="admin-media")


@app.get("/")
async def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "chat-backend"}


@app.get("/healthz", include_in_schema=False)
async def readiness_check() -> dict:
    # Database connectivity is load-bearing for the whole app, so a failure here
    # propagates as a 500 and correctly fails the container's Docker HEALTHCHECK.
    await get_db().command("ping")

    # Translation (LibreTranslate) and TTS (Piper) are degradable dependencies --
    # the rest of the app (chat, whiteboard, notes, files, auth) works without
    # them. Their status is reported here for visibility but intentionally does
    # NOT change this endpoint's HTTP status code, so a downstream outage in one
    # of them doesn't mark the whole backend container unhealthy in Docker/Caddy.
    checks: dict[str, str] = {"database": "ok"}

    import httpx

    try:
        libretranslate_url = get_settings().LIBRETRANSLATE_URL.rstrip("/")
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(f"{libretranslate_url}/languages")
            response.raise_for_status()
        checks["libretranslate"] = "ok"
    except Exception as exc:
        checks["libretranslate"] = f"unreachable: {exc}"

    try:
        from app.tts.service import tts_service
        checks["tts"] = "ok" if tts_service.status().get("ready") else "not_ready"
    except Exception as exc:
        checks["tts"] = f"error: {exc}"

    overall = "ok" if all(value == "ok" for value in checks.values()) else "degraded"
    return {"status": overall, "service": "chat-backend", "checks": checks}
