from datetime import datetime
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorDatabase


class MessageRepository:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self.collection = db["messages"]

    async def create_indexes(self) -> None:
        await self.collection.create_index([("room_id", 1), ("timestamp", -1)])

    async def save(
        self,
        room_id: str,
        sender_name: str,
        original_text: str,
        source_language: str,
        delivery_mode: str = "broadcast",
        sender_id: Optional[str] = None,
        recipient_id: Optional[str] = None,
    ) -> dict:
        doc = {
            "room_id": room_id,
            "sender_id": sender_id,
            "sender_name": sender_name,
            "recipient_id": recipient_id,
            "original_text": original_text,
            "translations": {},
            "source_language": source_language,
            "timestamp": datetime.utcnow(),
            "delivery_mode": delivery_mode,
        }
        result = await self.collection.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    async def get_room_messages(self, room_id: str, limit: int = 50) -> list[dict]:
        cursor = self.collection.find(
            {"room_id": room_id},
            sort=[("timestamp", -1)],
            limit=limit,
        )
        docs = await cursor.to_list(length=limit)
        return list(reversed(docs))
