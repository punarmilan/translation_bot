from datetime import datetime
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorDatabase


class RoomRepository:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self.collection = db["rooms"]

    async def create_indexes(self) -> None:
        await self.collection.create_index("room_id", unique=True)

    async def create(self, room_id: str, room_name: str, host_id: str) -> dict:
        doc = {
            "room_id": room_id,
            "room_name": room_name,
            "host_id": host_id,
            "created_at": datetime.utcnow(),
            "is_active": True,
        }
        await self.collection.insert_one(doc)
        return doc

    async def find_by_room_id(self, room_id: str) -> Optional[dict]:
        return await self.collection.find_one({"room_id": room_id})

    async def upsert(self, room_id: str, room_name: str, host_id: str) -> dict:
        existing = await self.find_by_room_id(room_id)
        if existing:
            return existing
        return await self.create(room_id, room_name, host_id)
