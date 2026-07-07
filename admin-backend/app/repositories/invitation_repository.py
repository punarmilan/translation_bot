import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument


def invite_fingerprint(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class AdminInvitationRepository:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self.collection = db["admin_invitations"]

    async def create_indexes(self) -> None:
        await self.collection.create_index("token_fingerprint", unique=True)
        await self.collection.create_index("expires_at", expireAfterSeconds=0)

    async def create(self, created_by: str, email: str | None, expire_hours: int) -> tuple[str, dict]:
        token = secrets.token_urlsafe(32)
        now = datetime.now(timezone.utc)
        record = {
            "token_fingerprint": invite_fingerprint(token),
            "email": email.lower().strip() if email else None,
            "created_by": created_by,
            "created_at": now,
            "expires_at": now + timedelta(hours=expire_hours),
            "used_at": None,
            "used_by": None,
        }
        result = await self.collection.insert_one(record)
        record["_id"] = result.inserted_id
        return token, record

    async def consume(self, token: str, email: str) -> dict | None:
        now = datetime.now(timezone.utc)
        return await self.collection.find_one_and_update(
            {
                "token_fingerprint": invite_fingerprint(token),
                "used_at": None,
                "expires_at": {"$gt": now},
                "$or": [{"email": None}, {"email": email.lower().strip()}],
            },
            {"$set": {"used_at": now, "used_by": email.lower().strip()}},
            return_document=ReturnDocument.AFTER,
        )
