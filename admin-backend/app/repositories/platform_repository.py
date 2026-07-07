from datetime import datetime, timezone

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class PlatformRepository:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self.db = db

    async def create_indexes(self) -> None:
        await self.db["admin_content"].create_index("key", unique=True)
        await self.db["feature_flags"].create_index("key", unique=True)
        await self.db["platform_languages"].create_index("code", unique=True)
        await self.db["voice_models"].create_index("key", unique=True)
        await self.db["announcements"].create_index([("created_at", -1)])
        await self.db["feedback"].create_index([("created_at", -1)])
        await self.db["admin_roles"].create_index("key", unique=True)

    async def list(self, collection: str, query: dict | None = None, limit: int = 500) -> list[dict]:
        return await self.db[collection].find(query or {}).sort("updated_at", -1).limit(limit).to_list(length=limit)

    async def get_by_key(self, collection: str, key: str) -> dict | None:
        return await self.db[collection].find_one({"key": key})

    async def create(self, collection: str, document: dict) -> dict:
        now = utcnow()
        record = {**document, "created_at": now, "updated_at": now}
        result = await self.db[collection].insert_one(record)
        record["_id"] = result.inserted_id
        return record

    async def upsert_by_key(self, collection: str, key: str, changes: dict) -> dict:
        now = utcnow()
        await self.db[collection].update_one(
            {"key": key},
            {"$set": {**changes, "updated_at": now}, "$setOnInsert": {"key": key, "created_at": now}},
            upsert=True,
        )
        return await self.db[collection].find_one({"key": key})

    async def update(self, collection: str, item_id: str, changes: dict) -> dict | None:
        try:
            object_id = ObjectId(item_id)
        except Exception:
            return None
        await self.db[collection].update_one({"_id": object_id}, {"$set": {**changes, "updated_at": utcnow()}})
        return await self.db[collection].find_one({"_id": object_id})

    async def delete(self, collection: str, item_id: str) -> bool:
        try:
            result = await self.db[collection].delete_one({"_id": ObjectId(item_id)})
        except Exception:
            return False
        return result.deleted_count == 1
