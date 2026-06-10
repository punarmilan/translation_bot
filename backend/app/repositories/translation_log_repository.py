from datetime import datetime

from motor.motor_asyncio import AsyncIOMotorDatabase


class TranslationLogRepository:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self.collection = db["translation_logs"]

    async def create_indexes(self) -> None:
        await self.collection.create_index("timestamp")
        await self.collection.create_index("room_id")

    async def log(
        self,
        room_id: str,
        source_language: str,
        target_language: str,
        translation_success: bool,
        cache_hit: bool = False,
    ) -> None:
        await self.collection.insert_one({
            "room_id": room_id,
            "source_language": source_language,
            "target_language": target_language,
            "translation_success": translation_success,
            "cache_hit": cache_hit,
            "timestamp": datetime.utcnow(),
        })
