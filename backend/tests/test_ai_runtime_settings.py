"""Regression tests for Phase 9: AI Models & AI Configuration.

Covers two real bugs found during the audit:

1. `RuntimeSettingsManager` never defined `self.voice_routing`, so
   `app/tts/voice_router.py`'s `runtime_settings.voice_routing` reference
   raised `AttributeError` on every call -- silently swallowed by a bare
   `except Exception: pass`, so the admin's already-built Voice Routing UI
   (VoicesPage.jsx, POST /api/admin/voices/routing) had zero runtime effect.
2. `ai_models`/`voice_routing` settings docs were never loaded from Mongo on
   startup and had no `update_settings()` branch, so even a correctly-shaped
   payload from the control-plane's UPDATE_SETTINGS command would be dropped.
"""

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import AsyncMock, MagicMock, patch

from app.runtime_settings import RuntimeSettingsManager
from app.tts.voice_router import resolve_voice_route


class RuntimeSettingsLoadTest(unittest.IsolatedAsyncioTestCase):
    async def test_load_from_db_picks_up_ai_models_and_voice_routing_docs(self) -> None:
        manager = RuntimeSettingsManager()

        async def fake_find_one(query):
            key = query.get("key")
            if key == "ai_models":
                return {"values": {"whisper_model": "small", "whisper_beam_size": 8}}
            if key == "voice_routing":
                return {"values": {"en": {"neutral": "en-lessac"}}}
            return None

        mock_settings_collection = MagicMock()
        mock_settings_collection.find_one = AsyncMock(side_effect=fake_find_one)

        mock_db = MagicMock()

        def getitem(name):
            if name == "platform_settings":
                return mock_settings_collection
            collection = MagicMock()
            collection.find = MagicMock(return_value=_EmptyCursor())
            return collection

        mock_db.__getitem__.side_effect = getitem

        await manager.load_from_db(mock_db)

        self.assertEqual(manager.ai_settings["whisper_model"], "small")
        self.assertEqual(manager.ai_settings["whisper_beam_size"], 8)
        self.assertEqual(manager.voice_routing, {"en": {"neutral": "en-lessac"}})

    def test_update_settings_ai_models_and_voice_routing(self) -> None:
        manager = RuntimeSettingsManager()
        manager.update_settings("ai_models", {"whisper_model": "medium"})
        self.assertEqual(manager.ai_settings["whisper_model"], "medium")
        # Untouched keys keep their default -- this is dict.update, not a replace.
        self.assertEqual(manager.ai_settings["tts_provider"], "piper")

        manager.update_settings("voice_routing", {"hi": {"feminine": "hi-custom"}})
        self.assertEqual(manager.voice_routing, {"hi": {"feminine": "hi-custom"}})


class _EmptyCursor:
    def sort(self, *args, **kwargs):
        return self

    async def to_list(self, length=None):
        return []


class VoiceRoutingConsumptionTest(unittest.TestCase):
    """Proves resolve_voice_route() actually reads runtime_settings.voice_routing
    now, instead of the AttributeError being silently caught every time."""

    def test_configured_route_is_used_when_voice_file_exists(self) -> None:
        with TemporaryDirectory() as tmp:
            model_dir = Path(tmp)
            (model_dir / "custom-voice.onnx").write_bytes(b"fake")

            routing = {"en": {"neutral": "custom-voice"}}
            with (
                patch("app.tts.voices.DEFAULT_PIPER_MODEL_DIR", model_dir),
                patch("app.runtime_settings.runtime_settings.voice_routing", routing),
            ):
                route = resolve_voice_route("en", "neutral")

        self.assertEqual(route.model_path, model_dir / "custom-voice.onnx")
        self.assertFalse(route.fallback_used)

    def test_falls_back_to_static_routing_when_configured_voice_file_missing(self) -> None:
        routing = {"en": {"neutral": "nonexistent-voice"}}
        with patch("app.runtime_settings.runtime_settings.voice_routing", routing):
            route = resolve_voice_route("en", "neutral")

        # The configured entry pointed at a file that doesn't exist, so this
        # must fall through to the static PIPER_VOICE_VARIANTS routing rather
        # than returning a path that doesn't resolve to real audio.
        self.assertNotIn("nonexistent-voice", str(route.model_path))

    def test_empty_voice_routing_does_not_raise(self) -> None:
        with patch("app.runtime_settings.runtime_settings.voice_routing", {}):
            route = resolve_voice_route("en", "auto")
        self.assertEqual(route.requested_language, "en")


if __name__ == "__main__":
    unittest.main()
