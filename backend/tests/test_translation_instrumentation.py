import unittest
from unittest.mock import AsyncMock, patch

import httpx

from app.translation.service import TranslationService, detect_language_profile


class TranslationTimeoutInstrumentationTest(unittest.IsolatedAsyncioTestCase):
    async def test_provider_timeout_is_reported_as_timeout_status(self) -> None:
        service = TranslationService()
        with patch.object(
            httpx.AsyncClient,
            "post",
            new=AsyncMock(side_effect=httpx.TimeoutException("timed out")),
        ):
            result = await service.translate_text(
                text="hello",
                target_lang="fr",
                source_lang="en",
            )

        self.assertEqual(result.status, "timeout")
        self.assertIsNotNone(result.error)
        # Translation still degrades gracefully (original text returned), matching
        # pre-existing fallback behavior -- only the status categorization changed.
        self.assertEqual(result.translated, "hello")

    async def test_provider_connection_error_is_not_labeled_as_timeout(self) -> None:
        service = TranslationService()
        with patch.object(
            httpx.AsyncClient,
            "post",
            new=AsyncMock(side_effect=httpx.ConnectError("connection refused")),
        ):
            result = await service.translate_text(
                text="hello",
                target_lang="fr",
                source_lang="en",
            )

        self.assertEqual(result.status, "fallback_unavailable")


class CacheTimeoutWiringTest(unittest.IsolatedAsyncioTestCase):
    """P1 hardening item 14: TranslationCache already had full TTL-expiry
    logic (defaulting to the exact same 3600s the admin UI defaulted to for
    `cache_timeout_seconds`) -- it just never read the admin-configured
    value. Now wired the same way translation_timeout_seconds/
    detection_confidence already were."""

    async def test_cache_ttl_is_read_from_the_configured_setting(self) -> None:
        service = TranslationService()
        with patch(
            "app.runtime_settings.runtime_settings.translation_settings",
            {"cache_timeout_seconds": 1234},
        ), patch("app.runtime_settings.runtime_settings.enabled_languages", {"en"}):
            # Same source/target language takes the early "skip" path (no
            # HTTP call needed) but still runs the cache-ttl sync line first.
            await service.translate_text(text="hello", target_lang="en", source_lang="en")
        self.assertEqual(service.cache.ttl_seconds, 1234.0)

    async def test_cache_ttl_falls_back_to_its_own_default_when_unset(self) -> None:
        service = TranslationService()
        with patch("app.runtime_settings.runtime_settings.translation_settings", {}), \
             patch("app.runtime_settings.runtime_settings.enabled_languages", {"en"}):
            await service.translate_text(text="hello", target_lang="en", source_lang="en")
        self.assertEqual(service.cache.ttl_seconds, 3600.0)


class FallbackLanguageWiringTest(unittest.IsolatedAsyncioTestCase):
    """P1 hardening item 14: detect_language_profile() already had an
    "unsupported language -> fall back to X" branch hardcoded to "en"; now
    reads the admin-configured `fallback_language` instead."""

    async def test_configured_fallback_language_is_used_for_unsupported_detections(self) -> None:
        fake_candidates = [type("C", (), {"lang": "ja", "prob": 0.9})()]
        with patch("app.translation.service.detect_langs", return_value=fake_candidates), \
             patch("app.runtime_settings.runtime_settings.enabled_languages", {"en", "hi"}), \
             patch("app.runtime_settings.runtime_settings.translation_settings", {"fallback_language": "hi"}):
            detection = await detect_language_profile("some text with no hint at all")
        self.assertEqual(detection.language, "hi")
        self.assertEqual(detection.detection_source, "unsupported_fallback")

    async def test_defaults_to_english_when_fallback_language_is_not_configured(self) -> None:
        fake_candidates = [type("C", (), {"lang": "ja", "prob": 0.9})()]
        with patch("app.translation.service.detect_langs", return_value=fake_candidates), \
             patch("app.runtime_settings.runtime_settings.enabled_languages", {"en", "hi"}), \
             patch("app.runtime_settings.runtime_settings.translation_settings", {}):
            detection = await detect_language_profile("some text with no hint at all")
        self.assertEqual(detection.language, "en")


if __name__ == "__main__":
    unittest.main()
