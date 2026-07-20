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

app.include_router(auth_router)
app.include_router(auth_router, prefix="/api", include_in_schema=False)
app.include_router(websocket_router)


@app.get("/")
async def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "chat-backend"}


@app.get("/healthz", include_in_schema=False)
async def readiness_check() -> dict[str, str]:
    await get_db().command("ping")
    return {"status": "ok", "service": "chat-backend", "database": "ok"}
