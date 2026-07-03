from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import connect_db, disconnect_db, get_db
from app.repositories.audit_repository import AuditRepository
from app.routers import auth, dashboard, meetings, operations, users


@asynccontextmanager
async def lifespan(_: FastAPI):
    await connect_db()
    await AuditRepository(get_db()).create_indexes()
    yield
    await disconnect_db()


app = FastAPI(
    title="Translation Bot Admin API",
    description="Independent admin control and observability API",
    version="0.1.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(users.router)
app.include_router(meetings.router)
app.include_router(operations.router)


@app.get("/")
async def health() -> dict:
    return {"status": "ok", "service": "admin-backend"}
