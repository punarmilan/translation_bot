import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

class WhiteboardService:
    def __init__(self) -> None:
        # In-memory store for tracking active room whiteboard draw path operations
        self._whiteboard_states: Dict[str, List[Dict[str, Any]]] = {}

    async def handle_draw_event(self, room_id: str, sender_id: str, drawing_payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Processes a real-time drawing event (e.g. draw path, shape, text block, clear command).
        Appends the event to the room's drawing state for replication to joining users.
        """
        if room_id not in self._whiteboard_states:
            self._whiteboard_states[room_id] = []
        
        event_type = drawing_payload.get("action", "draw")
        
        if event_type == "clear":
            self._whiteboard_states[room_id] = []
            logger.info(f"Whiteboard cleared for room {room_id} by {sender_id}")
            return {"action": "clear", "sender_id": sender_id}
            
        self._whiteboard_states[room_id].append(drawing_payload)
        return {
            "action": event_type,
            "sender_id": sender_id,
            "data": drawing_payload.get("data")
        }

    async def get_whiteboard_state(self, room_id: str) -> Dict[str, Any]:
        """
        Returns the full current whiteboard shape/stroke state for a room.
        Used to synchronize state when a participant join.
        """
        return {
            "room_id": room_id,
            "elements": self._whiteboard_states.get(room_id, [])
        }

whiteboard_service = WhiteboardService()
