import logging
from typing import Optional, List, Dict, Any
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId

logger = logging.getLogger(__name__)

class GlossaryRepository:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self.collection = db["glossaries"]

    async def create_indexes(self) -> None:
        await self.collection.create_index("language")
        await self.collection.create_index([("source_term", 1), ("language", 1)], unique=True)

    async def save(
        self,
        source_term: str,
        target_term: str,
        language: str,
        industry: str = "General",
        priority: int = 1,
        case_sensitive: bool = False,
        notes: Optional[str] = None,
        enabled: bool = True,
    ) -> Dict[str, Any]:
        doc = {
            "source_term": source_term.strip(),
            "target_term": target_term.strip(),
            "language": language.lower().strip(),
            "industry": industry,
            "priority": priority,
            "case_sensitive": case_sensitive,
            "notes": notes,
            "enabled": enabled,
        }
        
        # Check if term already exists
        existing = await self.collection.find_one({"source_term": source_term, "language": language})
        if existing:
            await self.collection.update_one({"_id": existing["_id"]}, {"$set": doc})
            doc["_id"] = str(existing["_id"])
        else:
            res = await self.collection.insert_one(doc)
            doc["_id"] = str(res.inserted_id)
            
        return doc

    async def get_active_glossary_for_lang(self, language: str) -> List[Dict[str, Any]]:
        cursor = self.collection.find({"language": language.lower().strip(), "enabled": True})
        rows = await cursor.to_list(length=1000)
        for r in rows:
            r["_id"] = str(r["_id"])
        return rows

    async def delete(self, entry_id: str) -> bool:
        try:
            oid = ObjectId(entry_id)
        except Exception:
            return False
        res = await self.collection.delete_one({"_id": oid})
        return res.deleted_count > 0

    async def list_all(self, limit: int = 100) -> List[Dict[str, Any]]:
        cursor = self.collection.find({}).limit(limit)
        rows = await cursor.to_list(length=limit)
        for r in rows:
            r["_id"] = str(r["_id"])
        return rows
