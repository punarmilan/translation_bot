import unittest
from unittest.mock import AsyncMock, patch

import httpx

from app.translation.service import TranslationService


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


if __name__ == "__main__":
    unittest.main()
