import hashlib
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import get_settings


class MediaRepository:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self.collection = db["media_assets"]
        self.root = Path(get_settings().MEDIA_ROOT).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    async def create_indexes(self) -> None:
        await self.collection.create_index([("created_at", -1)])
        await self.collection.create_index("checksum")

    def destination(self, original_name: str) -> tuple[str, Path]:
        suffix = Path(original_name).suffix.lower()
        stored_name = f"{uuid.uuid4().hex}{suffix}"
        return stored_name, self.root / stored_name

    async def create(self, original_name: str, stored_name: str, content_type: str, size: int, checksum: str, actor_id: str) -> dict:
        record = {
            "original_name": original_name,
            "stored_name": stored_name,
            "content_type": content_type,
            "size": size,
            "checksum": checksum,
            "uploaded_by": actor_id,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        result = await self.collection.insert_one(record)
        record["_id"] = result.inserted_id
        return record

    async def list(self, search: str = "") -> list[dict]:
        query = {"original_name": {"$regex": search, "$options": "i"}} if search else {}
        return await self.collection.find(query).sort("created_at", -1).limit(500).to_list(length=500)

    async def get(self, media_id: str) -> dict | None:
        try:
            return await self.collection.find_one({"_id": ObjectId(media_id)})
        except Exception:
            return None

    async def replace_metadata(self, media_id: str, values: dict) -> dict | None:
        try:
            object_id = ObjectId(media_id)
        except Exception:
            return None
        await self.collection.update_one({"_id": object_id}, {"$set": {**values, "updated_at": datetime.now(timezone.utc)}})
        return await self.collection.find_one({"_id": object_id})

    async def delete(self, media_id: str) -> bool:
        asset = await self.get(media_id)
        if not asset:
            return False
        path = self.root / asset["stored_name"]
        if path.exists() and path.is_file():
            os.remove(path)
        await self.collection.delete_one({"_id": asset["_id"]})
        return True


def checksum_for(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
