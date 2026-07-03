from datetime import datetime, timezone

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase


class AdminUserRepository:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self.collection = db["users"]

    async def list(self, search: str, role: str | None, status: str | None, page: int, page_size: int) -> tuple[list[dict], int]:
        query: dict = {"deleted_at": {"$exists": False}}
        if search:
            query["$or"] = [
                {"name": {"$regex": search, "$options": "i"}},
                {"username": {"$regex": search, "$options": "i"}},
                {"email": {"$regex": search, "$options": "i"}},
            ]
        if role:
            query["role"] = role
        if status == "online":
            query["is_online"] = True
        elif status == "disabled":
            query["is_disabled"] = True
        elif status == "active":
            query["is_disabled"] = {"$ne": True}
        total = await self.collection.count_documents(query)
        cursor = self.collection.find(query, {"password_hash": 0}).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size)
        return await cursor.to_list(length=page_size), total

    async def get(self, user_id: str) -> dict | None:
        try:
            return await self.collection.find_one({"_id": ObjectId(user_id)}, {"password_hash": 0})
        except Exception:
            return None

    async def update(self, user_id: str, changes: dict) -> dict | None:
        try:
            changes["updated_at"] = datetime.now(timezone.utc)
            await self.collection.update_one({"_id": ObjectId(user_id)}, {"$set": changes})
            return await self.get(user_id)
        except Exception:
            return None

    async def soft_delete(self, user_id: str) -> bool:
        try:
            result = await self.collection.update_one(
                {"_id": ObjectId(user_id)},
                {"$set": {"deleted_at": datetime.now(timezone.utc), "is_disabled": True, "is_online": False}},
            )
            return result.modified_count == 1
        except Exception:
            return False
