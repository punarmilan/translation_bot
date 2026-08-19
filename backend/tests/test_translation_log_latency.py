"""Regression test for Phase 10: text-chat translation log entries used to
hardcode latency_ms=0 (app/websocket_manager.py's broadcast_chat), which
diluted the Dashboard/System Health pages' $avg-based latency metrics with
fake zeros mixed in among the voice pipeline's real measurements. Chat
translation latency is now actually measured with perf_counter() and
logged, matching the voice pipeline's convention of using None (excluded
by Mongo's $avg) when a stage doesn't apply, never a fabricated 0.

Also caught a second, larger pre-existing bug in the same code path while
fixing this: the log() call passed `translated_text=translated_text`, but
`translated_text` was never assigned anywhere in broadcast_chat's scope (it
only existed in a separate, unrelated function) -- every call raised
NameError, silently caught by the surrounding try/except, so no text-chat
message has ever actually reached translation_logs or
update_translation_stats. Fixed to `translated_text=result.translated`.
"""

import asyncio
import json
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from starlette.websockets import WebSocketState

from app.translation.service import LanguageDetection, TranslationResult
from app.websocket_manager import RoomConnectionManager


class FakeWebSocket:
    def __init__(self) -> None:
        self.client_state = WebSocketState.CONNECTED
        self.sent: list[dict] = []
        self.client = None
        self.headers: dict[str, str] = {}

    async def send_text(self, payload: str) -> None:
        self.sent.append(json.loads(payload))

    async def close(self, code: int = 1000, reason: str | None = None) -> None:
        self.client_state = WebSocketState.DISCONNECTED


async def drain_sender_queues(manager: RoomConnectionManager) -> None:
    queues = [session.outbound_queue.join() for session in manager.sessions.values()]
    if queues:
        await asyncio.wait_for(asyncio.gather(*queues), timeout=2)


class TranslationLogLatencyTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.mock_db = MagicMock()
        self.mock_db.__getitem__.return_value = AsyncMock()

        self.patch_get_db = patch("app.websocket_manager.get_db", return_value=self.mock_db)
        self.patch_get_db.start()
        self.addCleanup(self.patch_get_db.stop)

        self.patch_user_repo = patch("app.websocket_manager.UserRepository")
        mock_user_repo_cls = self.patch_user_repo.start()
        mock_user_repo = AsyncMock()
        mock_user_repo.get_by_id.return_value = {"email": "test@example.com"}
        mock_user_repo_cls.return_value = mock_user_repo
        self.addCleanup(self.patch_user_repo.stop)

        self.patch_room_repo = patch("app.websocket_manager.RoomRepository")
        mock_room_repo_cls = self.patch_room_repo.start()
        mock_room_repo_cls.return_value = AsyncMock()
        self.addCleanup(self.patch_room_repo.stop)

        self.manager = RoomConnectionManager()

    async def asyncTearDown(self) -> None:
        sockets = [session.websocket for session in list(self.manager.sessions.values())]
        for socket in sockets:
            await self.manager.disconnect(socket, "room")

    async def test_chat_translation_log_uses_real_measured_latency_not_zero(self) -> None:
        sockets = {"en": FakeWebSocket(), "hi": FakeWebSocket()}
        await self.manager.connect(sockets["en"], "room", None, "English User", "en")
        await self.manager.connect(sockets["hi"], "room", None, "Hindi User", "hi")
        await drain_sender_queues(self.manager)

        async def fake_detect(_text: str, language_hint=None) -> LanguageDetection:
            return LanguageDetection(language="en", candidates=[("en", 1.0)], mixed_language=False, confidence=1.0, detection_source="test")

        async def fake_translate(text, target_lang, source_lang="auto", mixed_language=False, context=None) -> TranslationResult:
            await asyncio.sleep(0.01)  # ensure measured latency is non-trivially > 0
            return TranslationResult(
                original=text, translated=f"{source_lang}->{target_lang}:{text}",
                source_language=source_lang, target_language=target_lang,
                status="success", cache_hit=False, mixed_language=mixed_language,
            )

        logged_calls = []

        class FakeLogRepo:
            def __init__(self, db):
                pass

            async def log(self, **kwargs):
                logged_calls.append(kwargs)

        with (
            patch("app.websocket_manager.detect_language_profile", fake_detect),
            patch("app.websocket_manager.translate_text", fake_translate),
            patch("app.websocket_manager.TranslationLogRepository", FakeLogRepo),
        ):
            await self.manager.broadcast_chat(
                sender_socket=sockets["en"],
                room_id="room",
                sender_name="English User",
                text="hello",
            )
            await drain_sender_queues(self.manager)

        self.assertEqual(len(logged_calls), 1)
        call = logged_calls[0]
        self.assertIsNotNone(call["latency_ms"])
        self.assertGreater(call["latency_ms"], 0)
        self.assertEqual(call["latency_ms"], call["translation_latency_ms"])
        # Pins the translated_text NameError fix: this used to never even
        # reach here (the whole call raised before logged_calls could grow).
        self.assertEqual(call["translated_text"], "en->hi:hello")


if __name__ == "__main__":
    unittest.main()
