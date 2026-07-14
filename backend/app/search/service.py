import logging
from abc import ABC, abstractmethod
from typing import Any, Dict, List
from app.database import get_db

logger = logging.getLogger(__name__)

# --- Search Engine Interface ---

class SearchEngine(ABC):
    @abstractmethod
    async def keyword_search(self, query: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Searches across all documents matching keyword query."""
        pass

    @abstractmethod
    async def meeting_search(self, query: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Searches for meetings/rooms matching query terms."""
        pass

    @abstractmethod
    async def transcript_search(self, query: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Searches transcription records for query matches."""
        pass

    @abstractmethod
    async def summary_search(self, query: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Searches generated meeting summaries for matching takeaways or decisions."""
        pass

# --- MongoDB Implementation ---

class MongoSearchEngine(SearchEngine):
    async def keyword_search(self, query: str, limit: int = 50) -> List[Dict[str, Any]]:
        db = get_db()
        # Searches transcripts and summaries matching query terms
        transcripts = await self.transcript_search(query, limit=limit // 2)
        summaries = await self.summary_search(query, limit=limit // 2)
        return transcripts + summaries

    async def meeting_search(self, query: str, limit: int = 50) -> List[Dict[str, Any]]:
        db = get_db()
        # Match meeting rooms by ID or name
        cursor = db["rooms"].find({
            "$or": [
                {"room_id": {"$regex": query, "$options": "i"}},
                {"room_name": {"$regex": query, "$options": "i"}},
                {"host_id": {"$regex": query, "$options": "i"}}
            ]
        }).limit(limit)
        rooms = await cursor.to_list(length=limit)
        for r in rooms:
            r["_id"] = str(r["_id"])
        return rooms

    async def transcript_search(self, query: str, limit: int = 50) -> List[Dict[str, Any]]:
        db = get_db()
        cursor = db["messages"].find({
            "$or": [
                {"original_text": {"$regex": query, "$options": "i"}},
                {"sender_name": {"$regex": query, "$options": "i"}}
            ]
        }).limit(limit)
        messages = await cursor.to_list(length=limit)
        for m in messages:
            m["_id"] = str(m["_id"])
            if "timestamp" in m and not isinstance(m["timestamp"], str):
                m["timestamp"] = m["timestamp"].isoformat()
        return messages

    async def summary_search(self, query: str, limit: int = 50) -> List[Dict[str, Any]]:
        db = get_db()
        cursor = db["meeting_summaries"].find({
            "$or": [
                {"summary_text": {"$regex": query, "$options": "i"}},
                {"action_items.task": {"$regex": query, "$options": "i"}},
                {"decisions": {"$regex": query, "$options": "i"}},
                {"open_questions": {"$regex": query, "$options": "i"}},
                {"topics": {"$regex": query, "$options": "i"}}
            ]
        }).limit(limit)
        summaries = await cursor.to_list(length=limit)
        for s in summaries:
            s["_id"] = str(s["_id"])
            if "generated_at" in s and not isinstance(s["generated_at"], str):
                s["generated_at"] = s["generated_at"].isoformat()
        return summaries

search_engine = MongoSearchEngine()
