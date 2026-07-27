import asyncio
import json
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from starlette.websockets import WebSocketState

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


async def drain_sender_queues(manager: RoomConnectionManager) -> None:
    queues = [session.outbound_queue.join() for session in manager.sessions.values()]
    if queues:
        await asyncio.wait_for(asyncio.gather(*queues), timeout=2)


class AdminCommandTest(unittest.IsolatedAsyncioTestCase):
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
        self.sockets = {
            "host": FakeWebSocket(),
            "guest": FakeWebSocket(),
        }
        self.session_ids = {
            "host": await self.manager.connect(self.sockets["host"], "room", None, "Host User", "en"),
            "guest": await self.manager.connect(self.sockets["guest"], "room", None, "Guest User", "en"),
        }
        await drain_sender_queues(self.manager)
        for socket in self.sockets.values():
            socket.sent.clear()

    async def asyncTearDown(self) -> None:
        sockets = [session.websocket for session in list(self.manager.sessions.values())]
        for socket in sockets:
            await self.manager.disconnect(socket, "room")
        self.patch_get_db.stop()
        self.patch_user_repo.stop()
        self.patch_room_repo.stop()

    def command(self, command_type: str, target_key: str, **payload) -> dict:
        return {
            "command_type": command_type,
            "room_id": "room",
            "target_session_id": self.session_ids[target_key],
            "target_user_id": None,
            "payload": payload,
            "command_id": "cmd-1",
        }

    async def test_promote_user_does_not_deadlock_and_updates_role(self) -> None:
        result = await asyncio.wait_for(
            self.manager.apply_admin_command(self.command("PROMOTE_USER", "guest", role="co-host")),
            timeout=3,
        )
        self.assertEqual(result["status"], "SUCCESS")
        self.assertEqual(self.manager.sessions[self.session_ids["guest"]].role, "co-host")

    async def test_transfer_host_does_not_deadlock_and_updates_host(self) -> None:
        result = await asyncio.wait_for(
            self.manager.apply_admin_command(self.command("TRANSFER_HOST", "guest")),
            timeout=3,
        )
        self.assertEqual(result["status"], "SUCCESS")
        room = self.manager.rooms["room"]
        self.assertEqual(room.meeting_host_session_id, self.session_ids["guest"])
        self.assertEqual(self.manager.sessions[self.session_ids["guest"]].role, "host")
        self.assertEqual(self.manager.sessions[self.session_ids["host"]].role, "participant")

    async def test_mute_participant_updates_server_state_and_notifies_room(self) -> None:
        await asyncio.wait_for(
            self.manager.apply_admin_command(self.command("MUTE_PARTICIPANT", "guest")),
            timeout=3,
        )
        await drain_sender_queues(self.manager)

        self.assertTrue(self.manager.sessions[self.session_ids["guest"]].is_muted)

        host_presence = [m for m in self.sockets["host"].sent if m.get("type") == "room_presence"]
        self.assertTrue(host_presence, "host should receive a room_presence update reflecting the mute")
        guest_member = next(
            m for m in host_presence[-1]["members"] if m["session_id"] == self.session_ids["guest"]
        )
        self.assertTrue(guest_member["is_muted"])

    async def test_unmute_participant_updates_server_state(self) -> None:
        await self.manager.apply_admin_command(self.command("MUTE_PARTICIPANT", "guest"))
        await asyncio.wait_for(
            self.manager.apply_admin_command(self.command("UNMUTE_PARTICIPANT", "guest")),
            timeout=3,
        )
        self.assertFalse(self.manager.sessions[self.session_ids["guest"]].is_muted)

    async def test_mute_all_updates_every_session_and_notifies_room(self) -> None:
        await asyncio.wait_for(
            self.manager.apply_admin_command(self.command("MUTE_ALL", "guest")),
            timeout=3,
        )
        await drain_sender_queues(self.manager)

        self.assertTrue(self.manager.sessions[self.session_ids["host"]].is_muted)
        self.assertTrue(self.manager.sessions[self.session_ids["guest"]].is_muted)

        guest_presence = [m for m in self.sockets["guest"].sent if m.get("type") == "room_presence"]
        self.assertTrue(guest_presence, "participants should receive a room_presence update after mute_all")


class RoomControlEndToEndTest(unittest.IsolatedAsyncioTestCase):
    """Regression coverage for the Priority 6B/6C admin-controls bug.

    Root cause: `RoomMember` (the object shape broadcast to clients for the
    participants list) only ever carries `session_id`, never `user_id`. The
    frontend's admin-command handlers build their outgoing `room_control`
    payload from a `RoomMember`, so `target_user_id` was always `undefined`
    and silently dropped by `JSON.stringify`. These tests exercise the real
    `websocket -> handle_room_control -> apply_admin_command -> ack` path
    (not just `apply_admin_command` directly, which is what let the original
    bug slip past `AdminCommandTest` above) using only the fields a real
    `RoomMember` actually has.
    """

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
        self.sockets = {
            "host": FakeWebSocket(),
            "guest": FakeWebSocket(),
        }
        self.session_ids = {
            "host": await self.manager.connect(self.sockets["host"], "room", None, "Host User", "en"),
            "guest": await self.manager.connect(self.sockets["guest"], "room", None, "Guest User", "en"),
        }
        await drain_sender_queues(self.manager)
        for socket in self.sockets.values():
            socket.sent.clear()

    async def asyncTearDown(self) -> None:
        sockets = [session.websocket for session in list(self.manager.sessions.values())]
        for socket in sockets:
            await self.manager.disconnect(socket, "room")
        self.patch_get_db.stop()
        self.patch_user_repo.stop()
        self.patch_room_repo.stop()

    def _member_by_session(self, room_id: str, session_id: str):
        """Returns the RoomMember object the frontend would actually see for a
        participant -- the same shape sent over `connection_ack`/`room_presence`."""
        room = self.manager.rooms[room_id]
        members = self.manager._room_members_unlocked(room)
        return next(m for m in members if m.session_id == session_id)

    def _frontend_room_control_payload(self, target_member, command_type: str, **payload) -> dict:
        """Mirrors ChatPage.jsx's handleRoomControl exactly: built only from
        fields a RoomMember actually exposes. There is deliberately no
        `target_user_id` key here -- RoomMember has no `user_id` field, so the
        real frontend payload never has one either."""
        return {
            "type": "room_control",
            "room_id": "room",
            "command_type": command_type,
            "target_session_id": target_member.session_id,
            "payload": payload,
        }

    async def test_host_mute_click_resolves_target_and_acknowledges_success(self) -> None:
        """Full flow: host clicks Mute -> correct payload sent -> backend resolves
        target via session_id alone -> command executes -> host gets a SUCCESS
        ack -> target's state actually changed."""
        guest_member = self._member_by_session("room", self.session_ids["guest"])
        payload = self._frontend_room_control_payload(guest_member, "MUTE_PARTICIPANT")
        self.assertNotIn("target_user_id", payload)  # matches real JSON.stringify output

        await self.manager.handle_room_control(self.sockets["host"], payload)
        await drain_sender_queues(self.manager)

        # Command executed: target participant state updated.
        self.assertTrue(self.manager.sessions[self.session_ids["guest"]].is_muted)

        # Host received a success acknowledgement.
        acks = [m for m in self.sockets["host"].sent if m.get("type") == "command_ack"]
        self.assertTrue(acks, "host should receive a command_ack message")
        self.assertEqual(acks[-1]["status"], "SUCCESS")
        self.assertEqual(acks[-1]["command_type"], "MUTE_PARTICIPANT")

    async def test_host_promote_click_resolves_target_and_acknowledges_success(self) -> None:
        guest_member = self._member_by_session("room", self.session_ids["guest"])
        payload = self._frontend_room_control_payload(guest_member, "PROMOTE_USER", role="co-host")

        await self.manager.handle_room_control(self.sockets["host"], payload)
        await drain_sender_queues(self.manager)

        self.assertEqual(self.manager.sessions[self.session_ids["guest"]].role, "co-host")
        acks = [m for m in self.sockets["host"].sent if m.get("type") == "command_ack"]
        self.assertEqual(acks[-1]["status"], "SUCCESS")

    async def test_host_transfer_host_click_resolves_target_and_acknowledges_success(self) -> None:
        guest_member = self._member_by_session("room", self.session_ids["guest"])
        payload = self._frontend_room_control_payload(guest_member, "TRANSFER_HOST")

        await self.manager.handle_room_control(self.sockets["host"], payload)
        await drain_sender_queues(self.manager)

        room = self.manager.rooms["room"]
        self.assertEqual(room.meeting_host_session_id, self.session_ids["guest"])
        acks = [m for m in self.sockets["host"].sent if m.get("type") == "command_ack"]
        self.assertEqual(acks[-1]["status"], "SUCCESS")

    async def test_host_kick_click_resolves_target_and_acknowledges_success(self) -> None:
        guest_member = self._member_by_session("room", self.session_ids["guest"])
        payload = self._frontend_room_control_payload(guest_member, "KICK_PARTICIPANT")

        await self.manager.handle_room_control(self.sockets["host"], payload)
        await drain_sender_queues(self.manager)

        kicked = [m for m in self.sockets["guest"].sent if m.get("type") == "participant_kicked"]
        self.assertTrue(kicked, "target participant should receive the kick event")
        acks = [m for m in self.sockets["host"].sent if m.get("type") == "command_ack"]
        self.assertEqual(acks[-1]["status"], "SUCCESS")

    async def test_unresolvable_target_still_acknowledges_instead_of_failing_silently(self) -> None:
        """Guards against the original bug's exact symptom: a command whose
        target could not be resolved must still notify the sender, not vanish."""
        payload = {
            "type": "room_control",
            "room_id": "room",
            "command_type": "MUTE_PARTICIPANT",
            "payload": {},
            # No target_session_id and no target_user_id at all -- this is the
            # literal payload shape the app used to send before the fix.
        }
        await self.manager.handle_room_control(self.sockets["host"], payload)
        await drain_sender_queues(self.manager)

        acks = [m for m in self.sockets["host"].sent if m.get("type") == "command_ack"]
        self.assertTrue(acks, "sender must be notified even when the target can't be resolved")
        self.assertEqual(acks[-1]["status"], "NOT_CONNECTED")

    async def test_non_host_sender_is_rejected(self) -> None:
        """Preserves the existing authorization check: only host/admin may issue
        room_control commands."""
        host_member = self._member_by_session("room", self.session_ids["host"])
        payload = self._frontend_room_control_payload(host_member, "MUTE_PARTICIPANT")

        await self.manager.handle_room_control(self.sockets["guest"], payload)
        await drain_sender_queues(self.manager)

        self.assertFalse(self.manager.sessions[self.session_ids["host"]].is_muted)
        acks = [m for m in self.sockets["guest"].sent if m.get("type") == "command_ack"]
        self.assertFalse(acks, "a non-host sender should not get a command ack at all")


if __name__ == "__main__":
    unittest.main()
