import asyncio
import json
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from starlette.websockets import WebSocketState

from app.translation.service import LanguageDetection, TranslationCache, TranslationResult
from app.websocket_manager import RoomConnectionManager


class FakeCollection:
    async def find_one(self, *args, **kwargs) -> None:
        return None

    async def insert_one(self, *args, **kwargs) -> None:
        return None

    async def update_one(self, *args, **kwargs) -> None:
        return None


class FakeDatabase:
    def __getitem__(self, name: str) -> FakeCollection:
        return FakeCollection()
class FakeClient:
    def __init__(self) -> None:
        self.host = "127.0.0.1"


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


async def drain_sender_queues(manager: RoomConnectionManager) -> None:
    queues = [session.outbound_queue.join() for session in manager.sessions.values()]
    if queues:
        await asyncio.wait_for(asyncio.gather(*queues), timeout=2)


def delivered_messages(websocket: FakeWebSocket) -> list[dict]:
    return [message for message in websocket.sent if message.get("type") == "message"]


class TranslationRoutingTest(unittest.IsolatedAsyncioTestCase):
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

    async def asyncTearDown(self) -> None:
        if hasattr(self, "manager"):
            sockets = [session.websocket for session in list(self.manager.sessions.values())]
            for socket in sockets:
                await self.manager.disconnect(socket, "room")
        
        self.patch_get_db.stop()
        self.patch_user_repo.stop()
        self.patch_room_repo.stop()

    async def connect_room(self) -> dict[str, FakeWebSocket]:
        self.manager = RoomConnectionManager()
        sockets = {
            "english": FakeWebSocket(),
            "hindi": FakeWebSocket(),
            "marathi": FakeWebSocket(),
        }
        await self.manager.connect(sockets["english"], "room", None, "English User", "en")
        await self.manager.connect(sockets["hindi"], "room", None, "Hindi User", "hi")
        await self.manager.connect(sockets["marathi"], "room", None, "Marathi User", "mr")
        await drain_sender_queues(self.manager)
        for socket in sockets.values():
            socket.sent.clear()
        return sockets

    async def assert_delivery(
        self,
        sender_key: str,
        text: str,
        source_language: str,
        expected: dict[str, str],
    ) -> None:
        sockets = await self.connect_room()
        calls: list[tuple[str, str, str]] = []

        async def fake_detect(_text: str, language_hint: str | None = None) -> LanguageDetection:
            return LanguageDetection(
                language=source_language,
                candidates=[(source_language, 1.0)],
                mixed_language=False,
                confidence=1.0,
                detection_source="test",
            )

        async def fake_translate(
            text: str,
            target_lang: str,
            source_lang: str = "auto",
            mixed_language: bool = False,
            context=None,
        ) -> TranslationResult:
            calls.append((text, source_lang, target_lang))
            return TranslationResult(
                original=text,
                translated=f"{source_lang}->{target_lang}:{text}",
                source_language=source_lang,
                target_language=target_lang,
                status="success",
                cache_hit=False,
                mixed_language=mixed_language,
            )

        with (
            patch("app.websocket_manager.detect_language_profile", fake_detect),
            patch("app.websocket_manager.translate_text", fake_translate),
        ):
            await self.manager.broadcast_chat(
                sender_socket=sockets[sender_key],
                room_id="room",
                sender_name=f"{sender_key} sender",
                text=text,
            )
            await drain_sender_queues(self.manager)

        for receiver_key, translated in expected.items():
            messages = delivered_messages(sockets[receiver_key])
            self.assertEqual(len(messages), 1)
            self.assertEqual(messages[0]["translated"], translated)
            self.assertEqual(messages[0]["target_language"], receiver_key_to_lang(receiver_key))

        translated_targets = {target for _, _, target in calls}
        expected_translated_targets = {
            receiver_key_to_lang(key)
            for key in expected
            if receiver_key_to_lang(key) != source_language
        }
        self.assertEqual(translated_targets, expected_translated_targets)

    async def test_english_hindi_marathi_delivery_in_same_room(self) -> None:
        await self.assert_delivery(
            sender_key="english",
            text="hello",
            source_language="en",
            expected={
                "english": "hello",
                "hindi": "en->hi:hello",
                "marathi": "en->mr:hello",
            },
        )

    async def test_hindi_to_english_in_same_room(self) -> None:
        await self.assert_delivery(
            sender_key="hindi",
            text="namaste",
            source_language="hi",
            expected={
                "english": "hi->en:namaste",
                "hindi": "namaste",
                "marathi": "hi->mr:namaste",
            },
        )

    async def test_marathi_to_english_in_same_room(self) -> None:
        await self.assert_delivery(
            sender_key="marathi",
            text="namaskar",
            source_language="mr",
            expected={
                "english": "mr->en:namaskar",
                "hindi": "mr->hi:namaskar",
                "marathi": "namaskar",
            },
        )


class TranslationCacheTest(unittest.TestCase):
    def test_cache_key_includes_target_language(self) -> None:
        cache = TranslationCache(max_size=10)
        cache.set("test", "hello", "en", "hi", "namaste")
        cache.set("test", "hello", "en", "mr", "namaskar")

        self.assertEqual(cache.get("test", "hello", "en", "hi"), "namaste")
        self.assertEqual(cache.get("test", "hello", "en", "mr"), "namaskar")


def receiver_key_to_lang(receiver_key: str) -> str:
    return {
        "english": "en",
        "hindi": "hi",
        "marathi": "mr",
    }[receiver_key]


if __name__ == "__main__":
    unittest.main()
