import unittest
from unittest.mock import AsyncMock, MagicMock, patch

import httpx

from app.main import readiness_check


class HealthzTest(unittest.IsolatedAsyncioTestCase):
    async def test_reports_ok_when_all_dependencies_are_healthy(self) -> None:
        mock_db = MagicMock()
        mock_db.command = AsyncMock(return_value={"ok": 1})

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()

        with (
            patch("app.main.get_db", return_value=mock_db),
            patch.object(httpx.AsyncClient, "get", new=AsyncMock(return_value=mock_response)),
            patch("app.tts.service.tts_service.status", return_value={"ready": True}),
        ):
            result = await readiness_check()

        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["checks"]["database"], "ok")
        self.assertEqual(result["checks"]["libretranslate"], "ok")
        self.assertEqual(result["checks"]["tts"], "ok")

    async def test_reports_degraded_without_failing_when_libretranslate_is_down(self) -> None:
        mock_db = MagicMock()
        mock_db.command = AsyncMock(return_value={"ok": 1})

        with (
            patch("app.main.get_db", return_value=mock_db),
            patch.object(
                httpx.AsyncClient,
                "get",
                new=AsyncMock(side_effect=httpx.ConnectError("connection refused")),
            ),
            patch("app.tts.service.tts_service.status", return_value={"ready": True}),
        ):
            # Should not raise -- a downstream translation outage must not fail
            # the endpoint (and therefore must not fail the container's
            # Docker HEALTHCHECK) since the rest of the app works without it.
            result = await readiness_check()

        self.assertEqual(result["status"], "degraded")
        self.assertEqual(result["checks"]["database"], "ok")
        self.assertIn("unreachable", result["checks"]["libretranslate"])

    async def test_reports_degraded_when_tts_not_ready(self) -> None:
        mock_db = MagicMock()
        mock_db.command = AsyncMock(return_value={"ok": 1})

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()

        with (
            patch("app.main.get_db", return_value=mock_db),
            patch.object(httpx.AsyncClient, "get", new=AsyncMock(return_value=mock_response)),
            patch("app.tts.service.tts_service.status", return_value={"ready": False}),
        ):
            result = await readiness_check()

        self.assertEqual(result["status"], "degraded")
        self.assertEqual(result["checks"]["tts"], "not_ready")

    async def test_database_failure_propagates_as_exception(self) -> None:
        mock_db = MagicMock()
        mock_db.command = AsyncMock(side_effect=RuntimeError("no primary available"))

        with patch("app.main.get_db", return_value=mock_db):
            # Database is load-bearing: unlike libretranslate/tts, a failure here
            # must propagate (FastAPI turns it into a 500), correctly failing the
            # container's Docker HEALTHCHECK.
            with self.assertRaises(RuntimeError):
                await readiness_check()


if __name__ == "__main__":
    unittest.main()
