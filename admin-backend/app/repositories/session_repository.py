from datetime import datetime, timezone

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase


class AdminSessionRepository:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self.collection = db["admin_sessions"]

    async def create_indexes(self) -> None:
        await self.collection.create_index("session_id", unique=True)
        await self.collection.create_index("expires_at", expireAfterSeconds=0)
        await self.collection.create_index([("admin_id", 1), ("revoked_at", 1)])

    async def create(
        self,
        admin_id: str,
        session_id: str,
        refresh_fingerprint: str,
        expires_at: datetime,
        ip_address: str | None,
        user_agent: str | None,
    ) -> None:
        await self.collection.insert_one({
            "admin_id": admin_id,
            "session_id": session_id,
            "refresh_fingerprint": refresh_fingerprint,
            "expires_at": expires_at,
            "created_at": datetime.now(timezone.utc),
            "rotated_at": None,
            "revoked_at": None,
            "revoke_reason": None,
            "ip_address": ip_address,
            "user_agent": user_agent,
        })

    async def get_active(self, session_id: str, refresh_fingerprint: str) -> dict | None:
        session = await self.collection.find_one({
            "session_id": session_id,
            "refresh_fingerprint": refresh_fingerprint,
            "revoked_at": None,
            "expires_at": {"$gt": datetime.now(timezone.utc)},
        })
        if session:
            try:
                session["admin_object_id"] = ObjectId(session["admin_id"])
            except Exception:
                return None
        return session

    async def rotate(self, session_id: str, refresh_fingerprint: str, expires_at: datetime, ip_address: str | None) -> None:
        await self.collection.update_one(
            {"session_id": session_id, "revoked_at": None},
            {"$set": {
                "refresh_fingerprint": refresh_fingerprint,
                "expires_at": expires_at,
                "rotated_at": datetime.now(timezone.utc),
                "last_ip_address": ip_address,
            }},
        )

    async def revoke(self, session_id: str, reason: str) -> None:
        await self.collection.update_one(
            {"session_id": session_id, "revoked_at": None},
            {"$set": {"revoked_at": datetime.now(timezone.utc), "revoke_reason": reason}},
        )
