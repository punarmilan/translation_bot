import json
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from starlette.websockets import WebSocketState

from app.schemas import IncomingVoiceChunkMessage
from app.stt.service import STTResult
from app.translation.service import LanguageDetection, TranslationResult
from app.websocket_manager import RoomConnectionManager


class FakeCollection:
    async def find_one(self, *args, **kwargs) -> None:
        return None

    async def insert_one(self, *args, **kwargs) -> None:
        return None

    async def update_one(self, *args, **kwargs) -> None:
        return None


class FakeWebSocket:
    def __init__(self) -> None:
        self.client_state = WebSocketState.CONNECTED
        self.sent: list[dict] = []
        self.client = None
        self.headers: dict[str, str] = {}

    async def send_text(self, payload: str) -> None:
        self.sent.append(json.loads(payload))

    async def close(self) -> None:
        self.client_state = WebSocketState.DISCONNECTED


class LanguageHintTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.mock_db = MagicMock()
        self.mock_db.__getitem__.return_value = AsyncMock()

        self.patch_get_db = patch("app.websocket_manager.get_db", return_value=self.mock_db)
        self.patch_get_db.start()

        self.patch_user_repo = patch("app.websocket_manager.UserRepository")
        self.mock_user_repo_cls = self.patch_user_repo.start()
        self.mock_user_repo = AsyncMock()
        self.mock_user_repo.get_by_id.return_value = {"email": "test@example.com"}
        self.mock_user_repo_cls.return_value = self.mock_user_repo

        self.patch_room_repo = patch("app.websocket_manager.RoomRepository")
        self.mock_room_repo_cls = self.patch_room_repo.start()
        self.mock_room_repo = AsyncMock()
        self.mock_room_repo_cls.return_value = self.mock_room_repo

        self.manager = RoomConnectionManager()
        self.socket = FakeWebSocket()
        # Sender's declared "Your Spoken Language" is Hindi.
        session_id = await self.manager.connect(self.socket, "room", None, "Speaker", "hi")
        self.session = self.manager.sessions[session_id]
        self.session.in_meeting = True

    async def asyncTearDown(self) -> None:
        await self.manager.disconnect(self.socket, "room")
        self.patch_get_db.stop()
        self.patch_user_repo.stop()
        self.patch_room_repo.stop()

    async def _run_chunk(self) -> str | None:
        captured_hint: dict[str, str | None] = {}

        async def fake_transcribe(_audio: bytes, _mime: str) -> STTResult:
            # Whisper misdetects a short/ambiguous Hindi utterance as English.
            return STTResult(text="kya haal hai", language="en", provider="test", latency_ms=5)

        async def fake_detect(_text: str, language_hint: str | None = None) -> LanguageDetection:
            captured_hint["value"] = language_hint
            return LanguageDetection(
                language=language_hint or "en",
                candidates=[],
                mixed_language=False,
                confidence=1.0,
                detection_source="test",
            )

        async def fake_translate(text, target_lang, source_lang="auto", mixed_language=False, context=None):
            return TranslationResult(
                original=text,
                translated=text,
                source_language=source_lang,
                target_language=target_lang,
                status="success",
                mixed_language=mixed_language,
            )

        message = IncomingVoiceChunkMessage(
            type="voice_chunk",
            room_id="room",
            audio_base64="aGVsbG8=",  # "hello", content irrelevant since STT is mocked
            mime_type="audio/webm",
            sequence=1,
        )

        with (
            patch("app.websocket_manager.stt_service.transcribe", fake_transcribe),
            patch("app.websocket_manager.detect_language_profile", fake_detect),
            patch("app.websocket_manager.translate_text", fake_translate),
        ):
            await self.manager._process_voice_chunk(self.socket, message)

        return captured_hint.get("value")

    async def test_configured_language_takes_priority_over_whisper_guess(self) -> None:
        hint_used = await self._run_chunk()
        self.assertEqual(
            hint_used,
            "hi",
            "Expected the speaker's configured language ('hi') to be used as the "
            "detection hint, not Whisper's own (possibly wrong) guess ('en').",
        )

    async def test_falls_back_to_whisper_when_configured_language_is_disabled(self) -> None:
        with patch(
            "app.runtime_settings.runtime_settings.enabled_languages",
            {"en", "es", "fr"},  # "hi" no longer enabled
        ):
            hint_used = await self._run_chunk()
        self.assertEqual(
            hint_used,
            "en",
            "When the speaker's configured language isn't enabled, Whisper's own "
            "detected language should be used as the fallback hint.",
        )


if __name__ == "__main__":
    unittest.main()
