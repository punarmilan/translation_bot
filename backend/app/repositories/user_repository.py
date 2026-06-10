from datetime import datetime
from typing import Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

VALID_ROLES = {"admin", "host", "participant"}
VALID_LANGUAGES = {"en", "hi", "es", "fr", "de", "ja", "mr"}


class UserRepository:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self.collection = db["users"]

    async def create_indexes(self) -> None:
        await self.collection.create_index("username", unique=True)
        await self.collection.create_index("email", unique=True)

    async def create(
        self,
        username: str,
        email: str,
        password_hash: str,
        role: str = "participant",
        preferred_language: str = "en",
    ) -> dict:
        normalized_role = role.lower().strip()
        normalized_language = preferred_language.lower().strip()
        if normalized_role not in VALID_ROLES:
            normalized_role = "participant"
        if normalized_language not in VALID_LANGUAGES:
            normalized_language = "en"

        doc = {
            "username": username.strip(),
            "email": email.lower().strip(),
            "password_hash": password_hash,
            "role": normalized_role,
            "preferred_language": normalized_language,
            "created_at": datetime.utcnow(),
            "last_seen": None,
            "is_online": False,
        }
        result = await self.collection.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    async def find_by_email(self, email: str) -> Optional[dict]:
        return await self.collection.find_one({"email": email.lower().strip()})

    async def find_by_username(self, username: str) -> Optional[dict]:
        return await self.collection.find_one({"username": username.strip()})

    async def find_by_id(self, user_id: str) -> Optional[dict]:
        try:
            return await self.collection.find_one({"_id": ObjectId(user_id)})
        except Exception:
            return None

    async def get_by_email(self, email: str) -> Optional[dict]:
        return await self.find_by_email(email)

    async def get_by_username(self, username: str) -> Optional[dict]:
        return await self.find_by_username(username)

    async def get_by_id(self, user_id: str) -> Optional[dict]:
        return await self.find_by_id(user_id)

    async def list_users(self, limit: int = 100) -> list[dict]:
        cursor = self.collection.find({}, {"password_hash": 0}).sort("created_at", -1).limit(limit)
        return await cursor.to_list(length=limit)

    async def update_last_seen(self, user_id: str) -> None:
        await self.collection.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"last_seen": datetime.utcnow(), "is_online": True}},
        )

    async def set_offline(self, user_id: str) -> None:
        await self.collection.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"is_online": False, "last_seen": datetime.utcnow()}},
        )
