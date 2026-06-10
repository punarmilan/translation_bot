from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth.router import router as auth_router
from app.database import connect_db, disconnect_db, get_db
from app.repositories.message_repository import MessageRepository
from app.repositories.room_repository import RoomRepository
from app.repositories.translation_log_repository import TranslationLogRepository
from app.repositories.user_repository import UserRepository
from app.routes import router as websocket_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    db = get_db()
    await UserRepository(db).create_indexes()
    await RoomRepository(db).create_indexes()
    await MessageRepository(db).create_indexes()
    await TranslationLogRepository(db).create_indexes()
    yield
    await disconnect_db()


app = FastAPI(
    title="Realtime Multilingual Chat",
    description="Production-ready multilingual communication platform",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(websocket_router)


@app.get("/")
async def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "chat-backend"}
