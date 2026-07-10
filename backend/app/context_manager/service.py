import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

class ContextManagerService:
    def __init__(self) -> None:
        # In-memory store for local room context caching before database persistence
        self._room_contexts: Dict[str, List[str]] = {}

    async def add_context_hints(self, room_id: str, hints: List[str]) -> None:
        """
        Adds contextual hints (e.g. specialized terms, slide text, names)
        to help steer STT and translation pipelines.
        """
        if room_id not in self._room_contexts:
            self._room_contexts[room_id] = []
        self._room_contexts[room_id].extend(hints)
        logger.info(f"Added {len(hints)} context hints to room {room_id}")

    async def get_context_prompt(self, room_id: str) -> str:
        """
        Compiles the current room context hints into a system prompt segment
        suitable for feeding into STT model configuration or Translation services.
        """
        hints = self._room_contexts.get(room_id, [])
        if not hints:
            return ""
        return "Contextual terminology / glossary: " + ", ".join(hints)

    async def clear_context(self, room_id: str) -> None:
        """
        Clears all cached context hints for a room.
        """
        self._room_contexts.pop(room_id, None)
        logger.info(f"Cleared context hints for room {room_id}")

context_manager_service = ContextManagerService()
