from datetime import datetime, timezone

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase


class AdminMeetingRepository:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self.db = db
        self.rooms = db["rooms"]

    async def list(self, search: str, status: str | None, page: int, page_size: int) -> tuple[list[dict], int]:
        query: dict = {}
        if search:
            query["$or"] = [
                {"room_id": {"$regex": search, "$options": "i"}},
                {"room_name": {"$regex": search, "$options": "i"}},
            ]
        if status == "active":
            query["is_active"] = True
        elif status == "ended":
            query["is_active"] = {"$ne": True}
        total = await self.rooms.count_documents(query)
        rooms = await self.rooms.find(query).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size).to_list(length=page_size)
        output = []
        for room in rooms:
            host_id = room.get("host_id")
            try:
                host_key = ObjectId(host_id) if isinstance(host_id, str) else host_id
            except Exception:
                host_key = host_id
            host = await self.db["users"].find_one({"_id": host_key}) if host_key else None
            message_count = await self.db["messages"].count_documents({"room_id": room.get("room_id")})
            output.append({**room, "host_name": (host or {}).get("name") or (host or {}).get("username", "Unknown"), "message_count": message_count})
        return output, total

    async def queue_command(
        self,
        room_id: str | None,
        action: str,
        actor_id: str,
        participant_id: str | None = None,
        payload: dict | None = None,
    ) -> str:
        command = {
            "room_id": room_id,
            "action": action,
            "participant_id": participant_id,
            "actor_id": actor_id,
            "status": "queued",
            "payload": payload or {},
            "created_at": datetime.now(timezone.utc),
        }
        result = await self.db["admin_commands"].insert_one(command)
        if action == "END_MEETING" and room_id:
            await self.rooms.update_one({"room_id": room_id}, {"$set": {"is_active": False, "ended_at": datetime.now(timezone.utc)}})
        return str(result.inserted_id)

    async def complete_command(self, command_id: str, ack: dict) -> None:
        try:
            object_id = ObjectId(command_id)
        except Exception:
            return
        await self.db["admin_commands"].update_one(
            {"_id": object_id},
            {
                "$set": {
                    "status": ack.get("status", "UNKNOWN"),
                    "acknowledgement": ack,
                    "completed_at": datetime.now(timezone.utc),
                }
            },
        )
