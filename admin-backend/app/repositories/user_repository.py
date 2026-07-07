from __future__ import annotations

from datetime import datetime, timezone

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase


class AdminUserRepository:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self.collection = db["users"]

    async def create_indexes(self) -> None:
        await self.collection.create_index("username", unique=True)
        await self.collection.create_index("email", unique=True)

    async def create_admin(self, name: str, email: str, password_hash: str, permissions: list[str]) -> dict:
        clean_email = email.lower().strip()
        base = "".join(character for character in clean_email.split("@", 1)[0] if character.isalnum() or character in {"_", "-", "."})[:48] or "admin"
        username = base
        suffix = 1
        while await self.collection.find_one({"username": username}, {"_id": 1}):
            suffix += 1
            username = f"{base}{suffix}"
        document = {
            "name": name.strip(),
            "username": username,
            "email": clean_email,
            "password_hash": password_hash,
            "role": "admin",
            "admin_role": "administrator",
            "admin_permissions": permissions,
            "preferred_language": "en",
            "pronouns": None,
            "voice_preference": "auto",
            "created_at": datetime.now(timezone.utc),
            "last_seen": None,
            "is_online": False,
            "is_disabled": False,
        }
        result = await self.collection.insert_one(document)
        document["_id"] = result.inserted_id
        return document

    async def create_user(self, document: dict) -> dict:
        now = datetime.now(timezone.utc)
        clean_email = document["email"].lower().strip()
        username = document.get("username") or clean_email.split("@", 1)[0]
        record = {
            "name": document["name"].strip(),
            "username": username.strip(),
            "email": clean_email,
            "password_hash": document["password_hash"],
            "role": document.get("role", "participant"),
            "preferred_language": document.get("preferred_language", "en"),
            "pronouns": document.get("pronouns"),
            "voice_preference": document.get("voice_preference", "auto"),
            "admin_role": document.get("admin_role"),
            "admin_permissions": document.get("admin_permissions", []),
            "created_at": now,
            "last_seen": None,
            "is_online": False,
            "is_disabled": False,
            "meetings_joined": 0,
        }
        result = await self.collection.insert_one(record)
        record["_id"] = result.inserted_id
        return record

    async def list(
        self,
        search: str,
        role: str | None,
        status: str | None,
        page: int,
        page_size: int,
        sort_by: str = "created_at",
        sort_dir: str = "desc",
    ) -> tuple[list[dict], int]:
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
        allowed_sorts = {"created_at", "name", "email", "role", "preferred_language", "last_seen"}
        sort_field = sort_by if sort_by in allowed_sorts else "created_at"
        cursor = self.collection.find(query, {"password_hash": 0}).sort(sort_field, -1 if sort_dir == "desc" else 1).skip((page - 1) * page_size).limit(page_size)
        return await cursor.to_list(length=page_size), total

    async def export(self, search: str = "", role: str | None = None, status: str | None = None) -> list[dict]:
        users, _ = await self.list(search, role, status, 1, 10000)
        return users

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

    async def meeting_history(self, user: dict) -> list[dict]:
        identifiers = [str(user["_id"]), user.get("username"), user.get("email"), user.get("name")]
        query = {"$or": [
            {"host_id": {"$in": identifiers}},
            {"participants.user_id": {"$in": identifiers}},
            {"participants.username": {"$in": identifiers}},
            {"participants.email": {"$in": identifiers}},
            {"participants.name": {"$in": identifiers}},
        ]}
        return await self.collection.database["rooms"].find(query).sort("created_at", -1).limit(50).to_list(length=50)

    async def translation_usage(self, user: dict) -> dict:
        identifiers = [str(user["_id"]), user.get("username"), user.get("email"), user.get("name")]
        query = {"$or": [
            {"user_id": {"$in": identifiers}},
            {"sender_id": {"$in": identifiers}},
            {"speaker_id": {"$in": identifiers}},
            {"username": {"$in": identifiers}},
            {"speaker_name": {"$in": identifiers}},
        ]}
        db = self.collection.database
        total = await db["translation_logs"].count_documents(query)
        recent = await db["translation_logs"].find(query, {"_id": 0}).sort("timestamp", -1).limit(30).to_list(length=30)
        return {"total_translation_events": total, "recent_events": recent}
