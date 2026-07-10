import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

class ScreenSharingService:
    def __init__(self) -> None:
        # In-memory mapping of room_id to active presenter session details
        self._active_sharers: Dict[str, Dict[str, Any]] = {}

    async def start_sharing(self, room_id: str, presenter_session_id: str, presenter_name: str) -> Optional[Dict[str, Any]]:
        """
        Registers a screen sharing session for a room. Only one presenter may share at a time.
        """
        if room_id in self._active_sharers:
            logger.warning(f"Screen share request rejected: Room {room_id} has an active share by {self._active_sharers[room_id]['name']}")
            return None
            
        share_details = {
            "session_id": presenter_session_id,
            "name": presenter_name,
            "started_at": datetime.utcnow().isoformat() if "datetime" in globals() else None
        }
        self._active_sharers[room_id] = share_details
        logger.info(f"Screen share started in room {room_id} by {presenter_name}")
        return share_details

    async def stop_sharing(self, room_id: str, presenter_session_id: str) -> bool:
        """
        Deregisters a screen sharing session. Validates that the stop request comes from the active sharer.
        """
        active = self._active_sharers.get(room_id)
        if active and active["session_id"] == presenter_session_id:
            self._active_sharers.pop(room_id, None)
            logger.info(f"Screen share stopped in room {room_id}")
            return True
        return False

    async def get_active_share(self, room_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves active screen share information for the specified room.
        """
        return self._active_sharers.get(room_id)

screen_sharing_service = ScreenSharingService()
