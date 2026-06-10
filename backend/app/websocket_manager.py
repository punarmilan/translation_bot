import asyncio
import base64
import contextlib
import json
import logging
from collections import Counter
from dataclasses import dataclass, field
from uuid import uuid4

from fastapi import WebSocket
from starlette.websockets import WebSocketState

from app.schemas import (
    ConnectionAckMessage,
    IncomingVoiceChunkMessage,
    IncomingSignalingMessage,
    OutgoingSignalingMessage,
    RoomMember,
    RoomPresenceMessage,
    RoomStats,
    SystemMessage,
    TranslatedChatMessage,
    TranslatedTranscriptMessage,
    utc_timestamp,
)
from app.stt.service import stt_service
from app.translation.service import (
    TranslationResult,
    detect_language_profile,
    log_translation_event,
    normalize_language,
    translate_text,
)
from time import perf_counter


logger = logging.getLogger(__name__)

OUTBOUND_QUEUE_MAX_SIZE = 100
DELIVERY_TIMEOUT_SECONDS = 5.0
QUEUE_SHUTDOWN_SENTINEL = "__transport_queue_shutdown__"


@dataclass
class ClientSession:
    session_id: str
    websocket: WebSocket
    room_id: str
    username: str
    role: str
    preferred_language: str
    outbound_queue: asyncio.Queue[str] = field(
        default_factory=lambda: asyncio.Queue(maxsize=OUTBOUND_QUEUE_MAX_SIZE)
    )
    sender_task: asyncio.Task[None] | None = None
    connected: bool = True
    active_peer_session_id: str | None = None


@dataclass
class RoomState:
    room_id: str
    sessions: dict[str, ClientSession] = field(default_factory=dict)
    message_count: int = 0
    call_active: bool = False
    call_host_session_id: str | None = None
    call_participants: set[str] = field(default_factory=set)


class RoomConnectionManager:
    """Owns websocket sessions, room state, and nonblocking outbound delivery."""

    def __init__(self) -> None:
        self.rooms: dict[str, RoomState] = {}
        self.sessions_by_socket: dict[WebSocket, str] = {}
        self.sessions: dict[str, ClientSession] = {}
        self._lock = asyncio.Lock()

    async def connect(
        self,
        websocket: WebSocket,
        room_id: str,
        username: str,
        preferred_language: str,
        role: str = "participant",
    ) -> str:
        session = ClientSession(
            session_id=str(uuid4()),
            websocket=websocket,
            room_id=room_id,
            username=username,
            role=role,
            preferred_language=normalize_language(preferred_language),
        )
        session.sender_task = asyncio.create_task(self._sender_loop(session))

        async with self._lock:
            room = self.rooms.setdefault(room_id, RoomState(room_id=room_id))
            room.sessions[session.session_id] = session
            self.sessions[session.session_id] = session
            self.sessions_by_socket[websocket] = session.session_id
            stats = self._room_stats_unlocked(room)
            members = self._room_members_unlocked(room)

        self._log_transport_event(
            "connect",
            session=session,
            active_users=stats.active_users,
            language_distribution=stats.language_distribution,
        )
        self._log_transport_event("room_join", session=session)

        ack = ConnectionAckMessage.create(
            session_id=session.session_id,
            room_id=room_id,
            username=username,
            preferred_language=session.preferred_language,
            role=session.role,
            room_stats=stats,
            members=members,
        )
        self._enqueue(session, ack.model_dump_json(), event="connection_ack")
        await self.broadcast_system(room_id, f"{username} joined the room")
        await self.broadcast_presence(room_id)
        return session.session_id

    async def disconnect(
        self,
        websocket: WebSocket,
        room_id: str,
        reason: str = "client_disconnect",
    ) -> None:
        async with self._lock:
            session_id = self.sessions_by_socket.pop(websocket, None)
            session = self.sessions.pop(session_id, None) if session_id else None
            room = self.rooms.get(room_id)

            if not session:
                return

            session.connected = False
            peer_session_id = session.active_peer_session_id
            peer_to_notify: ClientSession | None = None
            if room:
                room.sessions.pop(session.session_id, None)
                for peer in room.sessions.values():
                    if peer.active_peer_session_id == session.session_id:
                        peer.active_peer_session_id = None
                        peer_to_notify = peer
                if not room.sessions:
                    self.rooms.pop(room_id, None)
                    stats = RoomStats(
                        room_id=room_id,
                        active_users=0,
                        message_count=room.message_count,
                        language_distribution={},
                    )
                else:
                    stats = self._room_stats_unlocked(room)
            else:
                stats = RoomStats(
                    room_id=room_id,
                    active_users=0,
                    message_count=0,
                    language_distribution={},
                )

        self._log_transport_event("disconnect", session=session, reason=reason)
        self._log_transport_event("room_leave", session=session, reason=reason)
        if peer_session_id:
            self._log_signaling_event(
                "call_ended",
                session=session,
                target_session_id=peer_session_id,
                reason=reason,
            )

        await self._stop_sender(session)
        await self._close_websocket(session.websocket)

        if peer_to_notify:
            call_end = OutgoingSignalingMessage.create(
                message_type="call_end",
                room_id=room_id,
                sender_session_id=session.session_id,
                sender_name=session.username,
                target_session_id=peer_to_notify.session_id,
                payload={"reason": "peer_disconnected"},
            )
            self._enqueue(peer_to_notify, call_end.model_dump_json(), event="call_end")

        if stats.active_users > 0:
            await self.broadcast_system(
                room_id,
                f"{session.username} left the room",
                room_stats=stats,
            )
            await self.broadcast_presence(room_id)

    async def broadcast_chat(
        self,
        sender_socket: WebSocket,
        room_id: str,
        sender_name: str,
        text: str,
        delivery_mode: str = "broadcast",
        target_session_id: str | None = None,
    ) -> None:
        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return
            sender_session = self._session_for_socket_unlocked(sender_socket)
            if not sender_session:
                return
            room.message_count += 1
            connections = self._message_recipients_unlocked(
                room=room,
                sender=sender_session,
                delivery_mode=delivery_mode,
                target_session_id=target_session_id,
            )
            target_session = (
                room.sessions.get(target_session_id)
                if delivery_mode == "direct" and target_session_id
                else None
            )

        if not connections:
            self._log_message_event(
                "delivery_rejected",
                sender=sender_session,
                delivery_mode=delivery_mode,
                target_session_id=target_session_id,
                reason="no_authorized_recipients",
            )
            return

        timestamp = utc_timestamp()
        detection = await detect_language_profile(
            text,
            language_hint=sender_session.preferred_language,
        )
        result_by_language: dict[str, TranslationResult] = {}

        source_language = normalize_language(detection.language)

        async def result_for_language(target_language: str) -> TranslationResult:
            target = normalize_language(target_language)
            cached_result = result_by_language.get(target)
            if cached_result:
                return cached_result

            if target == source_language:
                result = TranslationResult(
                    original=text,
                    translated=text,
                    source_language=source_language,
                    target_language=target,
                    status="skipped_same_language",
                    mixed_language=detection.mixed_language,
                )
                log_translation_event("translation.skipped", result=result)
            else:
                result = await translate_text(
                    text=text,
                    target_lang=target,
                    source_lang=detection.language,
                    mixed_language=detection.mixed_language,
                )

            result_by_language[target] = result
            return result

        for target_language in {session.preferred_language for session in connections}:
            await result_for_language(target_language)

        for receiver in connections:
            result = await result_for_language(receiver.preferred_language)
            payload = TranslatedChatMessage.create(
                room_id=room_id,
                sender_session_id=sender_session.session_id,
                sender_role=sender_session.role,
                delivery_mode=delivery_mode,
                target_session_id=target_session.session_id if target_session else None,
                target_name=target_session.username if target_session else None,
                original=text,
                translated=result.translated,
                sender=sender_name,
                detected_language=result.source_language,
                target_language=result.target_language,
                translation_status=result.status,
                translation_error=result.error,
                cache_hit=result.cache_hit,
                mixed_language=result.mixed_language,
                timestamp=timestamp,
            )
            self._enqueue(receiver, payload.model_dump_json(), event="chat_message")
            self._log_translation_delivery(
                sender=sender_session,
                receiver=receiver,
                original=text,
                result=result,
            )
            self._log_message_event(
                "direct_delivered" if delivery_mode == "direct" else "broadcast_delivered",
                sender=sender_session,
                receiver=receiver,
                delivery_mode=delivery_mode,
                target_session_id=target_session.session_id if target_session else None,
            )

    async def process_voice_chunk(
        self,
        sender_socket: WebSocket,
        message: IncomingVoiceChunkMessage,
    ) -> None:
        pipeline_started = perf_counter()
        async with self._lock:
            room = self.rooms.get(message.room_id)
            sender_session = self._session_for_socket_unlocked(sender_socket)
            if not room or not sender_session or sender_session.room_id != message.room_id:
                return
            receivers = list(room.sessions.values())

        try:
            audio_bytes = base64.b64decode(message.audio_base64)
        except Exception as exc:
            self._log_voice_event(
                "chunk_rejected",
                sender=sender_session,
                sequence=message.sequence,
                error=f"invalid_base64: {exc}",
            )
            return

        self._log_voice_event(
            "chunk_received",
            sender=sender_session,
            sequence=message.sequence,
            byte_length=len(audio_bytes),
            mime_type=message.mime_type,
        )

        try:
            stt_result = await stt_service.transcribe(audio_bytes, message.mime_type)
        except Exception as exc:
            self._log_voice_event(
                "stt_failed",
                sender=sender_session,
                sequence=message.sequence,
                error=str(exc),
            )
            return

        transcript = stt_result.text.strip()
        if not transcript:
            self._log_voice_event(
                "empty_transcript",
                sender=sender_session,
                sequence=message.sequence,
                stt_latency_ms=stt_result.latency_ms,
            )
            return

        detection = await detect_language_profile(
            transcript,
            language_hint=stt_result.language or sender_session.preferred_language,
        )
        source_language = normalize_language(stt_result.language or detection.language)

        for receiver in receivers:
            translation_started = perf_counter()
            if normalize_language(receiver.preferred_language) == source_language:
                result = TranslationResult(
                    original=transcript,
                    translated=transcript,
                    source_language=source_language,
                    target_language=receiver.preferred_language,
                    status="skipped_same_language",
                    mixed_language=detection.mixed_language,
                )
            else:
                result = await translate_text(
                    text=transcript,
                    target_lang=receiver.preferred_language,
                    source_lang=source_language,
                    mixed_language=detection.mixed_language,
                )

            translation_latency_ms = int((perf_counter() - translation_started) * 1000)
            total_latency_ms = int((perf_counter() - pipeline_started) * 1000)
            payload = TranslatedTranscriptMessage.create(
                room_id=message.room_id,
                sender_session_id=sender_session.session_id,
                sender=sender_session.username,
                original=transcript,
                translated=result.translated,
                detected_language=source_language,
                target_language=result.target_language,
                sequence=message.sequence,
                stt_provider=stt_result.provider,
                stt_latency_ms=stt_result.latency_ms,
                translation_latency_ms=translation_latency_ms,
                total_latency_ms=total_latency_ms,
                translation_status=result.status,
                translation_error=result.error,
            )
            self._enqueue(receiver, payload.model_dump_json(), event="voice_transcript")
            self._log_voice_event(
                "transcript_delivered",
                sender=sender_session,
                receiver=receiver,
                sequence=message.sequence,
                source_language=source_language,
                target_language=result.target_language,
                stt_latency_ms=stt_result.latency_ms,
                translation_latency_ms=translation_latency_ms,
                total_latency_ms=total_latency_ms,
            )

    async def broadcast_system(
        self,
        room_id: str,
        text: str,
        room_stats: RoomStats | None = None,
    ) -> None:
        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return
            sessions = list(room.sessions.values())
            stats = room_stats or self._room_stats_unlocked(room)

        message = SystemMessage.create(room_id=room_id, text=text, room_stats=stats)
        payload = message.model_dump_json()
        for session in sessions:
            self._enqueue(session, payload, event="system_message")

    async def broadcast_presence(self, room_id: str) -> None:
        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return
            sessions = list(room.sessions.values())
            stats = self._room_stats_unlocked(room)
            members = self._room_members_unlocked(room)

        payload = RoomPresenceMessage.create(
            room_id=room_id,
            members=members,
            room_stats=stats,
        ).model_dump_json()
        for session in sessions:
            self._enqueue(session, payload, event="room_presence")

    async def relay_signaling(
        self,
        sender_socket: WebSocket,
        message: IncomingSignalingMessage,
    ) -> bool:
        async with self._lock:
            sender = self._session_for_socket_unlocked(sender_socket)
            room = self.rooms.get(message.room_id)

            if not sender or not room or sender.room_id != message.room_id:
                return False

            if message.type == "call_started":
                if sender.role not in {"host", "admin"}:
                    self._log_signaling_event(
                        "relay_rejected",
                        session=sender,
                        target_session_id=None,
                        signaling_type=message.type,
                        reason="host_required",
                    )
                    return False

                room.call_active = True
                room.call_host_session_id = sender.session_id
                room.call_participants.add(sender.session_id)
                outgoing = OutgoingSignalingMessage.create(
                    message_type="call_started",
                    room_id=message.room_id,
                    sender_session_id=sender.session_id,
                    sender_name=sender.username,
                    payload={
                        "host_session_id": sender.session_id,
                        "participants": sorted(room.call_participants),
                    },
                )
                sessions = list(room.sessions.values())
                self._log_signaling_event(
                    "call_started",
                    session=sender,
                    target_session_id=None,
                    participants=len(room.call_participants),
                )
            elif message.type == "call_ended":
                room_wide = (
                    sender.session_id == room.call_host_session_id
                    or sender.role in {"host", "admin"}
                    or not room.call_active
                )
                if room_wide:
                    room.call_active = False
                    room.call_host_session_id = None
                    room.call_participants.clear()
                    payload = {"reason": "room_call_ended"}
                else:
                    room.call_participants.discard(sender.session_id)
                    payload = {
                        "reason": "peer_left",
                        "participants": sorted(room.call_participants),
                    }

                outgoing = OutgoingSignalingMessage.create(
                    message_type="call_ended",
                    room_id=message.room_id,
                    sender_session_id=sender.session_id,
                    sender_name=sender.username,
                    payload={**payload, **(message.payload or {})},
                )
                sessions = list(room.sessions.values())
                self._log_signaling_event(
                    "call_ended",
                    session=sender,
                    target_session_id=None,
                    reason=payload["reason"],
                )
            elif message.type in {
                "webrtc_offer",
                "webrtc_answer",
                "webrtc_ice_candidate",
            }:
                if not message.target_session_id:
                    self._log_signaling_event(
                        "relay_rejected",
                        session=sender,
                        target_session_id=None,
                        signaling_type=message.type,
                        reason="missing_target",
                    )
                    return False

                target = self.sessions.get(message.target_session_id)
                if (
                    not target
                    or target.room_id != message.room_id
                    or sender.session_id == target.session_id
                ):
                    self._log_signaling_event(
                        "relay_rejected",
                        session=sender,
                        target_session_id=message.target_session_id,
                        signaling_type=message.type,
                        reason="invalid_target",
                    )
                    return False

                room.call_participants.add(sender.session_id)
                room.call_participants.add(target.session_id)
                outgoing = OutgoingSignalingMessage.create(
                    message_type=message.type,
                    room_id=message.room_id,
                    sender_session_id=sender.session_id,
                    sender_name=sender.username,
                    target_session_id=target.session_id,
                    payload=message.payload,
                )
                event_by_type = {
                    "webrtc_offer": "offer_created",
                    "webrtc_answer": "answer_received",
                    "webrtc_ice_candidate": "ice_candidate_exchange",
                }
                self._log_signaling_event(
                    event_by_type[message.type],
                    session=sender,
                    target_session_id=target.session_id,
                )
                return self._enqueue(target, outgoing.model_dump_json(), event=message.type)
            else:
                target = self.sessions.get(message.target_session_id or "")
                if (
                    not target
                    or target.room_id != message.room_id
                    or sender.session_id == target.session_id
                ):
                    self._log_signaling_event(
                        "relay_rejected",
                        session=sender,
                        target_session_id=message.target_session_id,
                        signaling_type=message.type,
                        reason="invalid_target",
                    )
                return False

            if message.type in {"call_started", "call_ended"}:
                payload = outgoing.model_dump_json()
                delivered = True
                for session in sessions:
                    delivered = self._enqueue(session, payload, event=message.type) and delivered
                return delivered

            if message.type == "call_request":
                if sender.active_peer_session_id or target.active_peer_session_id:
                    self._log_signaling_event(
                        "relay_rejected",
                        session=sender,
                        target_session_id=target.session_id,
                        signaling_type=message.type,
                        reason="peer_busy",
                    )
                    busy_payload = OutgoingSignalingMessage.create(
                        message_type="call_reject",
                        room_id=sender.room_id,
                        sender_session_id=target.session_id,
                        sender_name=target.username,
                        target_session_id=sender.session_id,
                        payload={"reason": "peer_busy"},
                    )
                    self._enqueue(sender, busy_payload.model_dump_json(), event="call_reject")
                    return False
                sender.active_peer_session_id = target.session_id
                target.active_peer_session_id = sender.session_id
                self._log_signaling_event(
                    "call_started",
                    session=sender,
                    target_session_id=target.session_id,
                )
            elif message.type == "call_accept":
                sender.active_peer_session_id = target.session_id
                target.active_peer_session_id = sender.session_id
                self._log_signaling_event(
                    "call_accepted",
                    session=sender,
                    target_session_id=target.session_id,
                )
            elif message.type == "call_reject":
                sender.active_peer_session_id = None
                if target.active_peer_session_id == sender.session_id:
                    target.active_peer_session_id = None
                self._log_signaling_event(
                    "call_rejected",
                    session=sender,
                    target_session_id=target.session_id,
                )
            elif message.type == "call_end":
                sender.active_peer_session_id = None
                if target.active_peer_session_id == sender.session_id:
                    target.active_peer_session_id = None
                payload_reason = (
                    message.payload.get("reason")
                    if isinstance(message.payload, dict)
                    else None
                )
                self._log_signaling_event(
                    "call_ended",
                    session=sender,
                    target_session_id=target.session_id,
                    reason=payload_reason or "call_end",
                )

            outgoing = OutgoingSignalingMessage.create(
                message_type=message.type,
                room_id=message.room_id,
                sender_session_id=sender.session_id,
                sender_name=sender.username,
                target_session_id=target.session_id,
                payload=message.payload,
            )

        return self._enqueue(target, outgoing.model_dump_json(), event=message.type)

    async def room_stats(self, room_id: str) -> RoomStats:
        async with self._lock:
            room = self.rooms.get(room_id)
            if not room:
                return RoomStats(
                    room_id=room_id,
                    active_users=0,
                    message_count=0,
                    language_distribution={},
                )
            return self._room_stats_unlocked(room)

    async def all_room_stats(self) -> list[RoomStats]:
        async with self._lock:
            return [self._room_stats_unlocked(room) for room in self.rooms.values()]

    async def _sender_loop(self, session: ClientSession) -> None:
        while True:
            payload = await session.outbound_queue.get()
            if payload == QUEUE_SHUTDOWN_SENTINEL:
                return

            try:
                await asyncio.wait_for(
                    session.websocket.send_text(payload),
                    timeout=DELIVERY_TIMEOUT_SECONDS,
                )
            except Exception as exc:
                self._log_transport_event(
                    "delivery_failure",
                    session=session,
                    error=str(exc),
                    queue_size=session.outbound_queue.qsize(),
                )
                await self.disconnect(
                    session.websocket,
                    session.room_id,
                    reason="delivery_failure",
                )
                return
            finally:
                session.outbound_queue.task_done()

    async def _stop_sender(self, session: ClientSession) -> None:
        task = session.sender_task
        if not task:
            return

        if task is asyncio.current_task():
            return

        self._enqueue_shutdown(session)
        with contextlib.suppress(asyncio.TimeoutError):
            await asyncio.wait_for(task, timeout=DELIVERY_TIMEOUT_SECONDS)

        if not task.done():
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task

    async def _close_websocket(self, websocket: WebSocket) -> None:
        if websocket.client_state == WebSocketState.DISCONNECTED:
            return

        with contextlib.suppress(Exception):
            await websocket.close()

    def _enqueue(self, session: ClientSession, payload: str, event: str) -> bool:
        if not session.connected:
            return False

        try:
            session.outbound_queue.put_nowait(payload)
        except asyncio.QueueFull:
            self._log_transport_event(
                "delivery_failure",
                session=session,
                event=event,
                error="outbound_queue_full",
                queue_size=session.outbound_queue.qsize(),
            )
            asyncio.create_task(
                self.disconnect(
                    session.websocket,
                    session.room_id,
                    reason="outbound_queue_full",
                )
            )
            return False

        return True

    def _enqueue_shutdown(self, session: ClientSession) -> None:
        with contextlib.suppress(asyncio.QueueFull):
            session.outbound_queue.put_nowait(QUEUE_SHUTDOWN_SENTINEL)

    def _session_for_socket_unlocked(self, websocket: WebSocket) -> ClientSession | None:
        session_id = self.sessions_by_socket.get(websocket)
        if not session_id:
            return None
        return self.sessions.get(session_id)

    def _room_stats_unlocked(self, room: RoomState) -> RoomStats:
        language_counts = Counter(
            session.preferred_language for session in room.sessions.values()
        )
        return RoomStats(
            room_id=room.room_id,
            active_users=len(room.sessions),
            message_count=room.message_count,
            language_distribution=dict(sorted(language_counts.items())),
        )

    def _room_members_unlocked(self, room: RoomState) -> list[RoomMember]:
        return [
            RoomMember(
                session_id=session.session_id,
                username=session.username,
                preferred_language=session.preferred_language,
                role=session.role,
            )
            for session in sorted(room.sessions.values(), key=lambda item: item.username)
        ]

    def _message_recipients_unlocked(
        self,
        room: RoomState,
        sender: ClientSession,
        delivery_mode: str,
        target_session_id: str | None,
    ) -> list[ClientSession]:
        if delivery_mode == "broadcast":
            return list(room.sessions.values())

        if delivery_mode != "direct" or not target_session_id:
            return []

        target = room.sessions.get(target_session_id)
        if not target or target.session_id == sender.session_id:
            return []

        if sender.role == "admin":
            return [sender, target]

        if sender.role == "host" and target.role == "participant":
            return [sender, target]

        if sender.role == "participant" and target.role == "host":
            return [sender, target]

        return []

    def _log_transport_event(
        self,
        event: str,
        session: ClientSession | None = None,
        **fields: object,
    ) -> None:
        payload = {"event": f"transport.{event}", **fields}
        if session:
            payload.update(
                {
                    "session_id": session.session_id,
                    "room_id": session.room_id,
                    "username": session.username,
                    "role": session.role,
                    "preferred_language": session.preferred_language,
                }
            )
        logger.info(json.dumps(payload, ensure_ascii=False, sort_keys=True))

    def _log_message_event(
        self,
        event: str,
        sender: ClientSession,
        receiver: ClientSession | None = None,
        **fields: object,
    ) -> None:
        payload = {
            "event": f"message.{event}",
            "room_id": sender.room_id,
            "sender_session_id": sender.session_id,
            "sender_name": sender.username,
            "sender_role": sender.role,
            **fields,
        }
        if receiver:
            payload.update(
                {
                    "receiver_session_id": receiver.session_id,
                    "receiver_name": receiver.username,
                    "receiver_role": receiver.role,
                }
            )
        logger.info(json.dumps(payload, ensure_ascii=False, sort_keys=True))

    def _log_translation_delivery(
        self,
        sender: ClientSession,
        receiver: ClientSession,
        original: str,
        result: TranslationResult,
    ) -> None:
        logger.info(
            json.dumps(
                {
                    "event": "translation.delivery",
                    "room_id": sender.room_id,
                    "sender_username": sender.username,
                    "sender_language": sender.preferred_language,
                    "receiver_username": receiver.username,
                    "receiver_language": receiver.preferred_language,
                    "source_language": result.source_language,
                    "target_language": result.target_language,
                    "original_text": original,
                    "translated_text": result.translated,
                    "translation_status": result.status,
                    "translation_error": result.error,
                    "cache_hit": result.cache_hit,
                },
                ensure_ascii=False,
                sort_keys=True,
            )
        )

    def _log_voice_event(
        self,
        event: str,
        sender: ClientSession,
        receiver: ClientSession | None = None,
        **fields: object,
    ) -> None:
        payload = {
            "event": f"voice_translation.{event}",
            "room_id": sender.room_id,
            "sender_session_id": sender.session_id,
            "sender_name": sender.username,
            **fields,
        }
        if receiver:
            payload.update(
                {
                    "receiver_session_id": receiver.session_id,
                    "receiver_name": receiver.username,
                    "receiver_language": receiver.preferred_language,
                }
            )
        logger.info(json.dumps(payload, ensure_ascii=False, sort_keys=True))

    def _log_signaling_event(
        self,
        event: str,
        session: ClientSession,
        target_session_id: str,
        **fields: object,
    ) -> None:
        payload = {
            "event": f"webrtc.{event}",
            "session_id": session.session_id,
            "target_session_id": target_session_id,
            "room_id": session.room_id,
            "username": session.username,
            **fields,
        }
        logger.info(json.dumps(payload, ensure_ascii=False, sort_keys=True))
