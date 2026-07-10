import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
from app.database import get_db

logger = logging.getLogger(__name__)

class MeetingMemoryService:
    async def save_memory(self, room_id: str, content: str, sender_name: str, language: str) -> Dict[str, Any]:
        """
        Saves a chunk of transcript memory to MongoDB for persistent room context retrieval.
        """
        db = get_db()
        memory_doc = {
            "room_id": room_id,
            "sender_name": sender_name,
            "language": language,
            "content": content,
            "timestamp": datetime.utcnow()
        }
        result = await db["meeting_memories"].insert_one(memory_doc)
        memory_doc["_id"] = str(result.inserted_id)
        logger.info(f"Saved transcript segment memory to meeting_memories for room {room_id}")
        return memory_doc

    async def query_memory(self, room_id: str, search_query: str, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Queries the database for historical transcript matches within the room using a regex or text index.
        """
        db = get_db()
        cursor = db["meeting_memories"].find(
            {
                "room_id": room_id,
                "$or": [
                    {"content": {"$regex": search_query, "$options": "i"}},
                    {"sender_name": {"$regex": search_query, "$options": "i"}}
                ]
            }
        ).sort("timestamp", -1).limit(limit)
        
        memories = await cursor.to_list(length=limit)
        for m in memories:
            m["_id"] = str(m["_id"])
            m["timestamp"] = m["timestamp"].isoformat() if isinstance(m.get("timestamp"), datetime) else m.get("timestamp")
        return memories

meeting_memory_service = MeetingMemoryService()
