from datetime import datetime
from typing import Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

VALID_ROLES = {"admin", "host", "participant"}
VALID_LANGUAGES = {"ar", "de", "en", "es", "fr", "hi", "it", "nl", "pt", "ru"}
VALID_VOICE_PREFERENCES = {"feminine", "masculine", "neutral", "auto"}


class UserRepository:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self.collection = db["users"]

    async def create_indexes(self) -> None:
        await self.collection.create_index("username", unique=True)
        await self.collection.create_index("email", unique=True)

    async def create(
        self,
        name: str,
        email: str,
        password_hash: str,
        role: str = "participant",
        preferred_language: str = "en",
        pronouns: str | None = None,
        voice_preference: str = "auto",
        username: str | None = None,
        gender: str = "neutral",
    ) -> dict:
        normalized_role = role.lower().strip()
        normalized_language = preferred_language.lower().strip()
        normalized_voice = voice_preference.lower().strip()
        normalized_gender = gender.lower().strip() if gender else "neutral"
        if normalized_role not in VALID_ROLES:
            normalized_role = "participant"
        if normalized_language not in VALID_LANGUAGES:
            normalized_language = "en"
        if normalized_voice not in VALID_VOICE_PREFERENCES:
            normalized_voice = "auto"
        if normalized_gender not in {"feminine", "masculine", "neutral"}:
            normalized_gender = "neutral"

        clean_email = email.lower().strip()
        clean_name = name.strip()
        clean_username = username.strip() if username else await self._unique_username(clean_email)

        doc = {
            "name": clean_name,
            "username": clean_username,
            "email": clean_email,
            "password_hash": password_hash,
            "role": normalized_role,
            "preferred_language": normalized_language,
            "pronouns": normalize_optional(pronouns),
            "voice_preference": normalized_voice,
            "gender": normalized_gender,
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

    async def update_profile(
        self,
        user_id: str,
        preferred_language: str,
        pronouns: str | None,
        voice_preference: str,
        gender: str = "neutral",
    ) -> Optional[dict]:
        normalized_language = preferred_language.lower().strip()
        normalized_voice = voice_preference.lower().strip()
        normalized_gender = gender.lower().strip() if gender else "neutral"
        if normalized_language not in VALID_LANGUAGES:
            normalized_language = "en"
        if normalized_voice not in VALID_VOICE_PREFERENCES:
            normalized_voice = "auto"
        if normalized_gender not in {"feminine", "masculine", "neutral"}:
            normalized_gender = "neutral"

        await self.collection.update_one(
            {"_id": ObjectId(user_id)},
            {
                "$set": {
                    "preferred_language": normalized_language,
                    "pronouns": normalize_optional(pronouns),
                    "voice_preference": normalized_voice,
                    "gender": normalized_gender,
                }
            },
        )
        return await self.get_by_id(user_id)

    async def profile_distributions(self) -> dict:
        language_rows = await self.collection.aggregate(
            [{"$group": {"_id": "$preferred_language", "count": {"$sum": 1}}}]
        ).to_list(length=None)
        voice_rows = await self.collection.aggregate(
            [{"$group": {"_id": "$voice_preference", "count": {"$sum": 1}}}]
        ).to_list(length=None)
        total = await self.collection.count_documents({})
        return {
            "user_count": total,
            "language_distribution": {
                row["_id"] or "unknown": row["count"] for row in language_rows
            },
            "voice_preference_distribution": {
                row["_id"] or "auto": row["count"] for row in voice_rows
            },
        }

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

    async def _unique_username(self, email: str) -> str:
        base = email.split("@", 1)[0].strip().lower() or "user"
        base = "".join(ch for ch in base if ch.isalnum() or ch in {"_", "-", "."})[:48] or "user"
        candidate = base
        suffix = 1
        while await self.find_by_username(candidate):
            suffix += 1
            candidate = f"{base}{suffix}"
        return candidate


def normalize_optional(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None
