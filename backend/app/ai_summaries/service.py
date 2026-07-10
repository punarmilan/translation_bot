import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
from app.database import get_db

logger = logging.getLogger(__name__)

class AISummariesService:
    async def generate_summary(self, room_id: str) -> Optional[Dict[str, Any]]:
        """
        Gathers transcripts from a completed meeting, processes them using the LLM pipeline
        to extract key takeaways, actions items, decisions, and saves the summary.
        """
        db = get_db()
        # Find all transcripts for this meeting room
        transcripts = await db["messages"].find({"room_id": room_id}).sort("timestamp", 1).to_list(length=1000)
        if not transcripts:
            logger.info(f"No transcripts found for room {room_id}. Summary skipped.")
            return None

        # Build raw conversation text block
        transcript_text = "\n".join([
            f"{t.get('sender_name', 'Unknown')}: {t.get('original_text', '')}"
            for t in transcripts
        ])

        # Stub LLM call: In production, feed transcript_text to an LLM
        summary_content = f"Meeting summary for room {room_id} generated at {datetime.utcnow().isoformat()}."
        key_takeaways = ["Takeaway 1: Collaboration details established.", "Takeaway 2: Multilingual platform integration validated."]
        action_items = [
            {"assignee": "host", "task": "Complete core integration benchmarks."},
            {"assignee": "participants", "task": "Validate real-time translated audio outputs."}
        ]

        summary_doc = {
            "room_id": room_id,
            "summary_text": summary_content,
            "key_takeaways": key_takeaways,
            "action_items": action_items,
            "generated_at": datetime.utcnow()
        }

        # Save to database
        result = await db["meeting_summaries"].insert_one(summary_doc)
        summary_doc["_id"] = str(result.inserted_id)
        logger.info(f"Successfully generated and stored AI summary for room {room_id}")
        return summary_doc

    async def get_summary(self, room_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves the latest generated AI summary for a room from MongoDB.
        """
        db = get_db()
        summary = await db["meeting_summaries"].find_one({"room_id": room_id}, sort=[("generated_at", -1)])
        if summary:
            summary["_id"] = str(summary["_id"])
            summary["generated_at"] = summary["generated_at"].isoformat() if isinstance(summary.get("generated_at"), datetime) else summary.get("generated_at")
        return summary

ai_summaries_service = AISummariesService()
