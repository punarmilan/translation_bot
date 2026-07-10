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
            "room_name": room_name or room_id,
            "host_id": host_id,
            "participants": [],
            "participant_count": 0,
            "languages": [],
            "is_active": True,
            "created_at": datetime.utcnow(),
            "ended_at": None,
            "duration": None,
            "translation_statistics": {
                "total_requests": 0,
                "success_count": 0,
                "failure_count": 0,
                "cache_hits": 0,
            },
            "voice_seconds": 0.0,
            "voice_minutes": 0.0,
            "message_count": 0,
        }
        await self.collection.insert_one(doc)
        return doc

    async def find_by_room_id(self, room_id: str) -> Optional[dict]:
        return await self.collection.find_one({"room_id": room_id})

    async def upsert(self, room_id: str, room_name: str, host_id: str) -> dict:
        existing = await self.find_by_room_id(room_id)
        if existing:
            # If room exists but was ended, reactivate it
            if not existing.get("is_active"):
                await self.collection.update_one(
                    {"room_id": room_id},
                    {"$set": {"is_active": True, "ended_at": None, "duration": None}}
                )
                existing["is_active"] = True
                existing["ended_at"] = None
                existing["duration"] = None
            return existing
        return await self.create(room_id, room_name, host_id)

    async def add_participant(
        self,
        room_id: str,
        user_id: str,
        username: str,
        name: str,
        email: str,
        country: str,
    ) -> None:
        room = await self.find_by_room_id(room_id)
        if not room:
            return
        participants = room.get("participants", [])
        exists = any(p.get("user_id") == user_id for p in participants)
        if not exists:
            participant_doc = {
                "user_id": user_id,
                "username": username,
                "name": name,
                "email": email,
                "joined_at": datetime.utcnow(),
                "left_at": None,
                "country": country,
            }
            await self.collection.update_one(
                {"room_id": room_id},
                {
                    "$push": {"participants": participant_doc},
                    "$inc": {"participant_count": 1}
                }
            )
        else:
            await self.collection.update_one(
                {"room_id": room_id, "participants.user_id": user_id},
                {"$set": {"participants.$.left_at": None}}
            )

    async def remove_participant(self, room_id: str, user_id: str) -> None:
        await self.collection.update_one(
            {"room_id": room_id, "participants.user_id": user_id},
            {"$set": {"participants.$.left_at": datetime.utcnow()}}
        )

    async def increment_message_count(self, room_id: str) -> None:
        await self.collection.update_one(
            {"room_id": room_id},
            {"$inc": {"message_count": 1}}
        )

    async def update_languages(self, room_id: str, language: str) -> None:
        await self.collection.update_one(
            {"room_id": room_id},
            {"$addToSet": {"languages": language}}
        )

    async def update_translation_stats(self, room_id: str, success: bool, cache_hit: bool = False) -> None:
        inc_fields = {
            "translation_statistics.total_requests": 1,
        }
        if success:
            inc_fields["translation_statistics.success_count"] = 1
        else:
            inc_fields["translation_statistics.failure_count"] = 1
        if cache_hit:
            inc_fields["translation_statistics.cache_hits"] = 1
        await self.collection.update_one(
            {"room_id": room_id},
            {"$inc": inc_fields}
        )

    async def update_voice_seconds(self, room_id: str, seconds: float) -> None:
        room = await self.find_by_room_id(room_id)
        if room:
            new_seconds = room.get("voice_seconds", 0.0) + seconds
            new_minutes = round(new_seconds / 60.0, 2)
            await self.collection.update_one(
                {"room_id": room_id},
                {"$set": {"voice_seconds": new_seconds, "voice_minutes": new_minutes}}
            )

    async def end_meeting(self, room_id: str) -> None:
        room = await self.find_by_room_id(room_id)
        if room:
            ended_at = datetime.utcnow()
            created_at = room.get("created_at") or ended_at
            duration = int((ended_at - created_at).total_seconds())
            await self.collection.update_one(
                {"room_id": room_id},
                {
                    "$set": {
                        "is_active": False,
                        "ended_at": ended_at,
                        "duration": duration
                    }
                }
            )

