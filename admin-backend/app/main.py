from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.config import get_settings
from app.database import connect_db, disconnect_db, get_db
from app.repositories.audit_repository import AuditRepository
from app.repositories.media_repository import MediaRepository
from app.repositories.invitation_repository import AdminInvitationRepository
from app.repositories.platform_repository import PlatformRepository
from app.repositories.session_repository import AdminSessionRepository
from app.repositories.user_repository import AdminUserRepository
from app.routers import auth, dashboard, media, meetings, platform, system, users, enterprise



@asynccontextmanager
async def lifespan(_: FastAPI):
    await connect_db()
    await AuditRepository(get_db()).create_indexes()
    await AdminSessionRepository(get_db()).create_indexes()
    await AdminInvitationRepository(get_db()).create_indexes()
    await AdminUserRepository(get_db()).create_indexes()
    await PlatformRepository(get_db()).create_indexes()
    await MediaRepository(get_db()).create_indexes()
    yield
    await disconnect_db()


app = FastAPI(
    title="Translation Bot Admin API",
    description="Independent admin control and observability API",
    version="0.1.0",
    lifespan=lifespan,
)


class AdminOriginMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if request.url.path.startswith("/api/admin") and request.method not in {"GET", "HEAD", "OPTIONS"}:
            origin = request.headers.get("origin")
            referer = request.headers.get("referer")
            
            # Fallback to Referer netloc if Origin header is missing
            if not origin and referer:
                from urllib.parse import urlparse
                parsed = urlparse(referer)
                origin = f"{parsed.scheme}://{parsed.netloc}"
                
            # If both headers are missing or origin is untrusted:
            if not origin or origin not in get_settings().frontend_origins:
                return JSONResponse(
                    {"detail": "Untrusted, missing, or cross-origin admin request (CSRF check failed)"},
                    status_code=403
                )
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Cache-Control"] = "no-store"
        return response



app.add_middleware(AdminOriginMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(users.router)
app.include_router(meetings.router)
app.include_router(platform.router)
app.include_router(platform.public_router)
app.include_router(media.router)
app.include_router(system.router)
app.include_router(enterprise.router)


media_root = Path(get_settings().MEDIA_ROOT).resolve()
media_root.mkdir(parents=True, exist_ok=True)
app.mount("/admin-media", StaticFiles(directory=media_root), name="admin-media")


@app.get("/")
async def health() -> dict:
    return {"status": "ok", "service": "admin-backend"}


@app.get("/healthz", include_in_schema=False)
async def readiness_check() -> dict[str, str]:
    await get_db().command("ping")
    return {"status": "ok", "service": "admin-backend", "database": "ok"}
