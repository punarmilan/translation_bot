from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase


class AuditRepository:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self.collection = db["admin_audit_logs"]

    async def create_indexes(self) -> None:
        await self.collection.create_index([("timestamp", -1)])
        await self.collection.create_index("actor_id")

    async def record(self, actor_id: str, action: str, target_type: str, target_id: str, metadata: dict | None = None) -> None:
        await self.collection.insert_one({
            "actor_id": actor_id,
            "action": action,
            "target_type": target_type,
            "target_id": target_id,
            "metadata": metadata or {},
            "timestamp": datetime.now(timezone.utc),
        })

    async def list(self, limit: int = 100, search: str = "", action: str | None = None) -> list[dict]:
        query: dict = {}
        if action:
            query["action"] = action
        if search:
            query["$or"] = [
                {"action": {"$regex": search, "$options": "i"}},
                {"target_type": {"$regex": search, "$options": "i"}},
                {"target_id": {"$regex": search, "$options": "i"}},
                {"actor_id": {"$regex": search, "$options": "i"}},
            ]
        return await self.collection.find(query).sort("timestamp", -1).limit(limit).to_list(length=limit)
