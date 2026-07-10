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
        speaker: str,
        source_language: str,
        target_language: str,
        transcript: str,
        translated_text: str,
        latency_ms: int,
        cache_hit: bool,
        voice_model: str | None,
        translation_success: bool,
    ) -> None:
        await self.collection.insert_one({
            "room_id": room_id,
            "speaker": speaker,
            "source_language": source_language,
            "target_language": target_language,
            "transcript": transcript,
            "translated_text": translated_text,
            "latency_ms": latency_ms,
            "cache_hit": cache_hit,
            "voice_model": voice_model,
            "translation_success": translation_success,
            "timestamp": datetime.utcnow(),
        })

