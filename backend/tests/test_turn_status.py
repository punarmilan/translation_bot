import unittest
from unittest.mock import patch

from app.routes import internal_turn_status


class FakeSettings:
    def __init__(self, host: str = "", port: int = 3478) -> None:
        self.TURN_HOST = host
        self.TURN_PORT = port


class TurnStatusTest(unittest.IsolatedAsyncioTestCase):
    async def test_reports_not_configured_when_turn_host_is_blank(self) -> None:
        with patch("app.routes.get_settings", return_value=FakeSettings(host="")):
            result = await internal_turn_status()
        self.assertEqual(result, {"configured": False, "reachable": None, "host": "", "port": 3478})

    async def test_reports_unreachable_when_connection_fails(self) -> None:
        # Port 1 on localhost is a well-known unassigned/closed port that
        # refuses connections immediately, so this exercises the real
        # asyncio.open_connection failure path without needing a live TURN server.
        with patch("app.routes.get_settings", return_value=FakeSettings(host="127.0.0.1", port=1)):
            result = await internal_turn_status()
        self.assertEqual(result["configured"], True)
        self.assertFalse(result["reachable"])
        self.assertEqual(result["host"], "127.0.0.1")


if __name__ == "__main__":
    unittest.main()
