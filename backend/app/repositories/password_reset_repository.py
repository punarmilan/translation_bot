from datetime import datetime
from typing import Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase


class PasswordResetRepository:
    """Stores hashed, single-use, expiring password-reset tokens.

    Only the SHA-256 hash of a token is ever persisted -- the raw token is
    handed to the requester once (via the forgot-password response/delivery
    channel) and never stored or logged. A TTL index on ``expires_at`` lets
    MongoDB garbage-collect stale tokens on its own; ``used_at`` is still the
    source of truth for one-time-use enforcement so a token can't be reused
    in the window before Mongo's TTL monitor sweeps it away.
    """

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self.collection = db["password_reset_tokens"]

    async def create_indexes(self) -> None:
        await self.collection.create_index("token_hash", unique=True)
        await self.collection.create_index("expires_at", expireAfterSeconds=0)
        await self.collection.create_index("user_id")

    async def create_token(self, user_id: str, token_hash: str, expires_at: datetime) -> dict:
        doc = {
            "user_id": user_id,
            "token_hash": token_hash,
            "expires_at": expires_at,
            "used_at": None,
            "created_at": datetime.utcnow(),
        }
        result = await self.collection.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    async def find_by_token_hash(self, token_hash: str) -> Optional[dict]:
        return await self.collection.find_one({"token_hash": token_hash})

    async def mark_used(self, token_id: ObjectId) -> None:
        await self.collection.update_one(
            {"_id": token_id},
            {"$set": {"used_at": datetime.utcnow()}},
        )

    async def invalidate_all_for_user(self, user_id: str) -> None:
        """Marks every still-usable token for this user as used, so requesting
        a new reset (or completing one) can't leave older links live."""
        await self.collection.update_many(
            {"user_id": user_id, "used_at": None},
            {"$set": {"used_at": datetime.utcnow()}},
        )
