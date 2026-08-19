"""Tests for P0 hardening item 3: an admin disabling/banning/suspending/
removing a user must actually terminate that user's already-open meeting
WebSocket connection server-side, not just ask the client to disconnect
itself. Before this change, FORCE_LOGOUT/REMOVE_USER/BAN_USER/SUSPEND_USER
only enqueued a `force_logout` notify message -- a client that ignored it (or
simply had no code path wired to react to it) could keep using an
already-open session indefinitely.

`apply_admin_command()` now schedules `_force_close_after_notify()` for each
targeted session alongside the existing notify message: it gives the
outbound queue a brief window to deliver the notify (patched to ~0 here for
fast tests), then closes the connection via the same `_close_websocket()`
helper every organic disconnect already uses.

Reconnection with a now-stale token is covered by the existing
test_disabled_user_auth.py (the REST/WS-level `_get_user_from_token` check);
the last test here demonstrates the two fixes combine to close the loop
completely: an open session is force-closed, and a fresh attempt to
reconnect with the same account's token is separately rejected.
"""

import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from bson import ObjectId

from app.routes import _get_user_from_token
from app.websocket_manager import RoomConnectionManager
from tests.test_admin_commands import FakeWebSocket, drain_sender_queues


async def _let_background_tasks_run() -> None:
    # _force_close_after_notify is scheduled with asyncio.create_task() and
    # not awaited by apply_admin_command itself (awaiting it directly would
    # block the ack on the notify-delivery grace period). A couple of
    # scheduler turns is enough for it to run to completion once that grace
    # period is patched to 0.
    for _ in range(5):
        await asyncio.sleep(0)


class WebSocketBanEnforcementTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.mock_db = MagicMock()
        self.mock_users_collection = AsyncMock()
        self.mock_db.__getitem__.return_value = self.mock_users_collection

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

        self.patch_grace = patch("app.websocket_manager.FORCE_CLOSE_NOTIFY_GRACE_SECONDS", 0)
        self.patch_grace.start()
        self.addCleanup(self.patch_grace.stop)

        self.user_ids = {"host": str(ObjectId()), "guest": str(ObjectId())}
        self.manager = RoomConnectionManager()
        self.sockets = {"host": FakeWebSocket(), "guest": FakeWebSocket()}
        self.session_ids = {
            "host": await self.manager.connect(self.sockets["host"], "room", self.user_ids["host"], "Host User", "en"),
            "guest": await self.manager.connect(self.sockets["guest"], "room", self.user_ids["guest"], "Guest User", "en"),
        }
        await drain_sender_queues(self.manager)
        for socket in self.sockets.values():
            socket.sent.clear()

    async def asyncTearDown(self) -> None:
        sockets = [session.websocket for session in list(self.manager.sessions.values())]
        for socket in sockets:
            await self.manager.disconnect(socket, "room")

    def _command(self, command_type: str, target_key: str, **payload) -> dict:
        return {
            "command_type": command_type,
            "room_id": "room",
            "target_session_id": self.session_ids[target_key],
            "target_user_id": None,
            "payload": payload,
            "command_id": "cmd-1",
        }

    async def test_force_logout_closes_the_targets_websocket(self) -> None:
        result = await self.manager.apply_admin_command(self._command("FORCE_LOGOUT", "guest"))
        self.assertEqual(result["status"], "SUCCESS")
        await _let_background_tasks_run()

        from starlette.websockets import WebSocketState
        self.assertEqual(self.sockets["guest"].client_state, WebSocketState.DISCONNECTED)
        self.assertEqual(self.sockets["guest"].close_code, 4003)

    async def test_force_logout_does_not_affect_other_active_sessions(self) -> None:
        await self.manager.apply_admin_command(self._command("FORCE_LOGOUT", "guest"))
        await _let_background_tasks_run()

        from starlette.websockets import WebSocketState
        self.assertEqual(self.sockets["host"].client_state, WebSocketState.CONNECTED)

    async def test_ban_user_closes_the_targets_websocket(self) -> None:
        await self.manager.apply_admin_command(self._command("BAN_USER", "guest"))
        await _let_background_tasks_run()

        from starlette.websockets import WebSocketState
        self.assertEqual(self.sockets["guest"].client_state, WebSocketState.DISCONNECTED)

    async def test_remove_user_closes_the_targets_websocket(self) -> None:
        await self.manager.apply_admin_command(self._command("REMOVE_USER", "guest"))
        await _let_background_tasks_run()

        from starlette.websockets import WebSocketState
        self.assertEqual(self.sockets["guest"].client_state, WebSocketState.DISCONNECTED)

    async def test_suspend_user_disables_account_and_closes_the_session(self) -> None:
        result = await self.manager.apply_admin_command(self._command("SUSPEND_USER", "guest"))
        self.assertEqual(result["status"], "SUCCESS")
        await _let_background_tasks_run()

        from starlette.websockets import WebSocketState
        self.assertEqual(self.sockets["guest"].client_state, WebSocketState.DISCONNECTED)
        self.mock_users_collection.update_one.assert_awaited()

    async def test_notify_message_is_still_delivered_before_the_close(self) -> None:
        await self.manager.apply_admin_command(self._command("FORCE_LOGOUT", "guest"))
        await drain_sender_queues(self.manager)
        await _let_background_tasks_run()

        notifications = [m for m in self.sockets["guest"].sent if m.get("type") == "force_logout"]
        self.assertTrue(notifications, "the target should still receive the force_logout notify message")

    async def test_banned_users_stale_token_is_rejected_on_reconnect_attempt(self) -> None:
        """Composes this fix with the existing Phase 10 auth check: after the
        open session is force-closed, a fresh connection attempt using the
        same account's token must also be rejected."""
        await self.manager.apply_admin_command(self._command("BAN_USER", "guest"))
        await _let_background_tasks_run()

        guest_object_id = ObjectId(self.user_ids["guest"])
        with patch("app.routes.get_db", return_value=self.mock_db), \
             patch("app.routes.decode_token", return_value={"sub": str(guest_object_id)}):
            self.mock_users_collection.find_one = AsyncMock(
                return_value={"_id": guest_object_id, "username": "guest", "is_disabled": True}
            )
            result = await _get_user_from_token("stale-guest-token")
        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
