"""Regression tests for meeting-policy runtime enforcement in
RoomConnectionManager -- the admin-configured platform_settings/meeting_policy
document (see admin-backend/app/routers/platform.py) actually affecting live
room admission and in-room behavior, not just persisting in MongoDB.
"""

import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from app.websocket_manager import MeetingPolicyRejected, RoomConnectionManager
from tests.test_admin_commands import FakeWebSocket, drain_sender_queues


def policy_patch(**overrides):
    from app.runtime_settings import runtime_settings
    values = dict(runtime_settings.meeting_policy)
    values.update(overrides)
    return patch("app.runtime_settings.runtime_settings.meeting_policy", values)


class MeetingPolicyTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.mock_db = MagicMock()
        self.mock_db.__getitem__.return_value = AsyncMock()

        self.patch_get_db = patch("app.websocket_manager.get_db", return_value=self.mock_db)
        self.patch_get_db.start()

        self.patch_user_repo = patch("app.websocket_manager.UserRepository")
        mock_user_repo_cls = self.patch_user_repo.start()
        mock_user_repo = AsyncMock()
        mock_user_repo.get_by_id.return_value = {"email": "test@example.com"}
        mock_user_repo_cls.return_value = mock_user_repo

        self.patch_room_repo = patch("app.websocket_manager.RoomRepository")
        mock_room_repo_cls = self.patch_room_repo.start()
        mock_room_repo_cls.return_value = AsyncMock()

        self.manager = RoomConnectionManager()

    async def asyncTearDown(self) -> None:
        # Mirrors test_admin_commands.py's teardown: disconnect every session
        # first so the background sender/voice-worker/summary-loop tasks each
        # room spawns are cancelled cleanly, *then* unpatch -- unpatching first
        # would let those tasks touch a torn-down mock mid-flight.
        sockets = [session.websocket for session in list(self.manager.sessions.values())]
        for socket in sockets:
            await self.manager.disconnect(socket, "room")
        self.patch_get_db.stop()
        self.patch_user_repo.stop()
        self.patch_room_repo.stop()

    async def test_max_participants_rejects_join_once_room_is_full(self) -> None:
        with policy_patch(max_participants=1):
            await self.manager.connect(FakeWebSocket(), "room", None, "First", "en")
            await drain_sender_queues(self.manager)
            with self.assertRaises(MeetingPolicyRejected) as ctx:
                await self.manager.connect(FakeWebSocket(), "room", None, "Second", "en")
            self.assertIn("limit", ctx.exception.reason)

    async def test_guest_join_disabled_rejects_userless_second_join(self) -> None:
        with policy_patch(allow_guest_join=False):
            await self.manager.connect(FakeWebSocket(), "room", "user-1", "Host", "en")
            await drain_sender_queues(self.manager)
            with self.assertRaises(MeetingPolicyRejected) as ctx:
                await self.manager.connect(FakeWebSocket(), "room", None, "Guest", "en")
            self.assertIn("Guest", ctx.exception.reason)

    async def test_first_joiner_always_admitted_regardless_of_policy(self) -> None:
        with policy_patch(max_participants=0, allow_guest_join=False, require_host_to_start=True):
            # Room-less join always succeeds -- there is no meeting to be at
            # capacity of, and the first joiner becomes the host by definition.
            session_id = await self.manager.connect(FakeWebSocket(), "room", None, "First", "en")
            self.assertTrue(session_id)

    async def test_require_host_to_start_blocks_join_once_host_has_left(self) -> None:
        with policy_patch(require_host_to_start=True):
            host_socket = FakeWebSocket()
            await self.manager.connect(host_socket, "room", None, "Host", "en")
            await self.manager.connect(FakeWebSocket(), "room", None, "Participant", "en")
            await drain_sender_queues(self.manager)

            # Host disconnects; the remaining participant keeps the room alive.
            await self.manager.disconnect(host_socket, "room", reason="test")
            self.assertTrue(self.manager.rooms["room"].sessions)
            self.assertFalse(any(s.role == "host" for s in self.manager.rooms["room"].sessions.values()))

            with self.assertRaises(MeetingPolicyRejected) as ctx:
                await self.manager.connect(FakeWebSocket(), "room", None, "Latecomer", "en")
            self.assertIn("host", ctx.exception.reason.lower())

    async def test_room_snapshots_policy_defaults_at_creation(self) -> None:
        with policy_patch(
            max_participants=7,
            screen_sharing_enabled=False,
            recording_enabled_default=False,
            captions_enabled_default=False,
            translation_enabled_default=False,
            idle_participant_timeout_minutes=15,
        ):
            await self.manager.connect(FakeWebSocket(), "room", None, "First", "en")
            room = self.manager.rooms["room"]
            self.assertEqual(room.max_participants, 7)
            self.assertFalse(room.screen_sharing_enabled)
            self.assertFalse(room.recording_enabled)
            self.assertFalse(room.captions_enabled)
            self.assertFalse(room.translation_enabled)
            self.assertEqual(room.idle_timeout_minutes, 15)

    async def test_screen_sharing_disabled_by_policy_blocks_activation(self) -> None:
        with policy_patch(screen_sharing_enabled=False):
            socket = FakeWebSocket()
            await self.manager.connect(socket, "room", None, "Host", "en")
            await drain_sender_queues(self.manager)
            await self.manager.handle_screen_share_update(socket, {"room_id": "room", "active": True})
            self.assertIsNone(self.manager.rooms["room"].active_screen_sharer_session_id)


if __name__ == "__main__":
    unittest.main()
