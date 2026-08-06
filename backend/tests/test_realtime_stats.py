import unittest
from unittest.mock import patch

from app.routes import internal_realtime_stats


class RealtimeStatsTest(unittest.IsolatedAsyncioTestCase):
    async def test_reports_session_and_room_counts_from_the_connection_manager(self) -> None:
        fake_manager = type("FakeManager", (), {
            "sessions": {"s1": object(), "s2": object(), "s3": object()},
            "rooms": {"room-a": object()},
        })()

        with patch("app.routes.manager", fake_manager):
            result = await internal_realtime_stats()

        self.assertEqual(result, {"active_connections": 3, "active_rooms": 1})

    async def test_reports_zero_when_nothing_is_connected(self) -> None:
        fake_manager = type("FakeManager", (), {"sessions": {}, "rooms": {}})()

        with patch("app.routes.manager", fake_manager):
            result = await internal_realtime_stats()

        self.assertEqual(result, {"active_connections": 0, "active_rooms": 0})


if __name__ == "__main__":
    unittest.main()
