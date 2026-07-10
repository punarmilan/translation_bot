import asyncio
import base64
import binascii
import contextlib
import json
import logging
from collections import Counter
from dataclasses import dataclass, field
from time import perf_counter
from uuid import uuid4

from fastapi import WebSocket
from starlette.websockets import WebSocketState

from app.schemas import (
    ConnectionAckMessage,
    IncomingSignalingMessage,
    IncomingVoiceActivityMessage,
    IncomingVoiceChunkMessage,
    ListenerMode,
    OutgoingSignalingMessage,
    RoomMember,
    RoomPresenceMessage,
    RoomStats,
    SystemMessage,
    TranslatedChatMessage,
    TranslationAudioMessage,
    TranslationStatusMessage,
    TranslatedTranscriptMessage,
    utc_timestamp,
)
from app.realtime_translation.service import realtime_translation_service
from app.stt.service import stt_service
from app.translation.service import (
    SUPPORTED_LANGUAGES,
    TranslationContext,
    TranslationResult,
    detect_language_profile,
    log_translation_event,
    normalize_language,
    translate_text,
)
from app.database import get_db
from app.repositories.room_repository import RoomRepository
from app.repositories.translation_log_repository import TranslationLogRepository
from app.repositories.user_repository import UserRepository
from bson import ObjectId
from datetime import datetime


def ip_to_country(ip: str, preferred_language: str) -> str:
    lang_country_map = {
        "en": "US",
        "hi": "IN",
        "es": "ES",
        "fr": "FR",
        "de": "DE",
        "ar": "EG",
        "ru": "RU",
        "pt": "BR",
        "it": "IT",
        "nl": "NL",
    }
    return lang_country_map.get(preferred_language.split("-")[0], "US")



logger = logging.getLogger(__name__)

OUTBOUND_QUEUE_MAX_SIZE = 100
DELIVERY_TIMEOUT_SECONDS = 5.0
VOICE_TRANSCRIPTION_TIMEOUT_SECONDS = 90.0
VOICE_CHUNK_QUEUE_MAX_SIZE = 8
QUEUE_SHUTDOWN_SENTINEL = "__transport_queue_shutdown__"


@dataclass
class ClientSession:
    session_id: str
    websocket: WebSocket
    room_id: str
    user_id: str | None
    username: str
    name: str | None
    role: str
    preferred_language: str
    pronouns: str | None = None
    voice_preference: str = "auto"
    listener_mode: ListenerMode = "original_translated_audio"
    outbound_queue: asyncio.Queue[str] = field(
        default_factory=lambda: asyncio.Queue(maxsize=OUTBOUND_QUEUE_MAX_SIZE)
    )
    sender_task: asyncio.Task[None] | None = None
    connected: bool = True
    active_peer_session_id: str | None = None
    in_meeting: bool = False
    voice_chunk_in_progress: bool = False
    voice_chunk_queue: asyncio.Queue[IncomingVoiceChunkMessage | None] = field(
        default_factory=lambda: asyncio.Queue(maxsize=VOICE_CHUNK_QUEUE_MAX_SIZE)
    )
    voice_worker_task: asyncio.Task[None] | None = None


@dataclass
class RoomState:
    room_id: str
    sessions: dict[str, ClientSession] = field(default_factory=dict)
    message_count: int = 0
    meeting_active: bool = False
    meeting_host_session_id: str | None = None
    meeting_media_type: str = "video"
    locked: bool = False
    chat_enabled: bool = True
    translation_enabled: bool = True


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
        user_id: str | None,
        username: str,
        preferred_language: str,
        name: str | None = None,
        role: str = "participant",
        pronouns: str | None = None,
        voice_preference: str = "auto",
    ) -> str:
        session = ClientSession(
            session_id=str(uuid4()),
            websocket=websocket,
            room_id=room_id,
            user_id=user_id,
            username=username,
            name=name or username,
            role=role,
            preferred_language=normalize_language(preferred_language),
            pronouns=pronouns,
            voice_preference=voice_preference,
        )
        session.sender_task = asyncio.create_task(self._sender_loop(session))
        session.voice_worker_task = asyncio.create_task(self._voice_worker(session))

        # DB updates for rooms and user presence
        db = get_db()
        user_repo = UserRepository(db)
        user_doc = await user_repo.get_by_id(user_id) if user_id else None
        email = user_doc.get("email", "") if user_doc else ""

        client_ip = websocket.client.host if websocket.client else "127.0.0.1"
        country = ip_to_country(client_ip, preferred_language)

        room_repo = RoomRepository(db)
        await room_repo.upsert(room_id, room_name=room_id, host_id=user_id or "")
        await room_repo.add_participant(
            room_id=room_id,
            user_id=user_id or "",
            username=username,
            name=name or username,
            email=email,
            country=country,
        )
        await room_repo.update_languages(room_id, preferred_language)

        if user_id:
            user_agent = websocket.headers.get("user-agent", "Unknown")
            try:
                await db["users"].update_one(
                    {"_id": ObjectId(user_id)},
                    {
                        "$set": {
                            "is_online": True,
                            "last_seen": datetime.utcnow(),
                            "meeting_id": room_id,
                            "device": user_agent,
                            "status": "online"
                        }
                    }
                )
            except Exception as e:
                logger.error(f"Error setting user presence online: {e}")

        async with self._lock:
            room = self.rooms.setdefault(room_id, RoomState(room_id=room_id))
            room.sessions[session.session_id] = session
            self.sessions[session.session_id] = session
            self.sessions_by_socket[websocket] = session.session_id
            stats = self._room_stats_unlocked(room)
            members = self._room_members_unlocked(room)
            meeting_host = room.sessions.get(room.meeting_host_session_id or "")
            meeting_state = (
                {
                    "host_session_id": room.meeting_host_session_id,
                    "media_type": room.meeting_media_type,
                    "host_name": meeting_host.username if meeting_host else "Host",
                }
                if room.meeting_active and meeting_host
                else None
            )
            room_policy = {
                "locked": room.locked,
                "chat_enabled": room.chat_enabled,
                "translation_enabled": room.translation_enabled,
            }

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
            name=session.name,
            preferred_language=session.preferred_language,
            role=session.role,
            pronouns=session.pronouns,
            voice_preference=session.voice_preference,
            room_stats=stats,
            members=members,
        )
        self._enqueue(session, ack.model_dump_json(), event="connection_ack")
        if meeting_state:
            active_call = OutgoingSignalingMessage.create(
                message_type="call_started",
                room_id=room_id,
                sender_session_id=meeting_state["host_session_id"],
                sender_name=meeting_state["host_name"],
                target_session_id=session.session_id,
                payload={
                    "host_session_id": meeting_state["host_session_id"],
                    "media_type": meeting_state["media_type"],
                },
            )
            self._enqueue(session, active_call.model_dump_json(), event="call_started")
        self._enqueue(
            session,
            json.dumps(
                {
                    "type": "room_policy",
                    "room_id": room_id,
                    **room_policy,
                    "timestamp": utc_timestamp(),
                }
            ),
            event="room_policy",
        )
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

            db = get_db()
            room_repo = RoomRepository(db)
            if session.user_id:
                await room_repo.remove_participant(room_id, session.user_id)
                other_sessions = [s for s in self.sessions.values() if s.user_id == session.user_id]
                if not other_sessions:
                    try:
                        await db["users"].update_one(
                            {"_id": ObjectId(session.user_id)},
                            {
                                "$set": {
                                    "is_online": False,
                                    "last_seen": datetime.utcnow(),
                                    "meeting_id": None,
                                    "status": "offline"
                                }
                            }
                        )
                    except Exception as e:
                        logger.error(f"Error setting user presence offline: {e}")

            if room:
                room.sessions.pop(session.session_id, None)
                host_ended_meeting = room.meeting_host_session_id == session.session_id
                if host_ended_meeting:
                    room.meeting_active = False
                    room.meeting_host_session_id = None
                    for remaining_session in room.sessions.values():
                        remaining_session.in_meeting = False
                for peer in room.sessions.values():
                    if peer.active_peer_session_id == session.session_id:
                        peer.active_peer_session_id = None
                        peer_to_notify = peer
                if not room.sessions:
                    self.rooms.pop(room_id, None)
                    await room_repo.end_meeting(room_id)
                    stats = RoomStats(
                        room_id=room_id,
                        active_users=0,
                        message_count=room.message_count,
                        language_distribution={},
                    )
                else:
                    stats = self._room_stats_unlocked(room)
            else:
                host_ended_meeting = False
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

        await self._stop_voice_worker(session)
        realtime_translation_service.release_session(session.session_id)
        await self._stop_sender(session)
        await self._close_websocket(session.websocket)

        if host_ended_meeting and stats.active_users > 0:
            meeting_ended = OutgoingSignalingMessage.create(
                message_type="call_ended",
                room_id=room_id,
                sender_session_id=session.session_id,
                sender_name=session.username,
                payload={"reason": "host_disconnected"},
            ).model_dump_json()
            async with self._lock:
                remaining_sessions = list(self.rooms.get(room_id, RoomState(room_id)).sessions.values())
            for remaining_session in remaining_sessions:
                self._enqueue(remaining_session, meeting_ended, event="call_ended")

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
            reason_text = f" ({reason})" if reason != "client_disconnect" else ""
            await self.broadcast_system(
                room_id,
                f"{session.username} left the room{reason_text}",
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
            if not room.chat_enabled:
                self._enqueue(
                    sender_session,
                    json.dumps(
                        {
                            "type": "chat_disabled",
                            "room_id": room_id,
                            "message": "Chat is disabled by an administrator.",
                            "timestamp": utc_timestamp(),
                        }
                    ),
                    event="chat_disabled",
                )
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
                    context=TranslationContext(
                        speaker_language=source_language,
                        target_language=target,
                        speaker_pronouns=sender_session.pronouns,
                        speaker_voice_preference=sender_session.voice_preference,
                        speaker_session_id=sender_session.session_id,
                    ),
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

        # DB updates for rooms message count and translation logs
        try:
            db = get_db()
            room_repo = RoomRepository(db)
            trans_log_repo = TranslationLogRepository(db)
            
            await room_repo.increment_message_count(room_id)
            for target, result in result_by_language.items():
                if target != source_language:
                    success = True if result.status == "success" or result.status == "skipped_same_language" else False
                    await trans_log_repo.log(
                        room_id=room_id,
                        speaker=sender_session.username,
                        source_language=source_language,
                        target_language=target,
                        transcript=text,
                        translated_text=result.translated,
                        latency_ms=0,
                        cache_hit=result.cache_hit,
                        voice_model=None,
                        translation_success=success
                    )
                    await room_repo.update_translation_stats(
                        room_id=room_id,
                        success=success,
                        cache_hit=result.cache_hit
                    )
        except Exception as e:
            logger.error(f"Error persisting chat translation log/stats: {e}")

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

    async def update_session_language(
        self,
        websocket: WebSocket,
        preferred_language: str,
    ) -> bool:
        new_language = normalize_language(preferred_language)
        from app.runtime_settings import runtime_settings
        if new_language not in runtime_settings.enabled_languages:
            new_language = "en"

        async with self._lock:
            session = self._session_for_socket_unlocked(websocket)
            if not session:
                return False
            old_language = session.preferred_language
            session.preferred_language = new_language
            room_id = session.room_id

        self._log_transport_event(
            "language_update",
            session=session,
            old_language=old_language,
            new_language=new_language,
        )
        await self.broadcast_presence(room_id)
        return True

    async def update_listener_preferences(
        self,
        websocket: WebSocket,
        listener_mode: ListenerMode,
    ) -> bool:
        async with self._lock:
            session = self._session_for_socket_unlocked(websocket)
            if not session:
                return False
            old_mode = session.listener_mode
            session.listener_mode = listener_mode

        self._log_transport_event(
            "listener_preferences_update",
            session=session,
            old_listener_mode=old_mode,
            listener_mode=listener_mode,
        )
        return True

    async def process_voice_chunk(
        self,
        sender_socket: WebSocket,
        message: IncomingVoiceChunkMessage,
    ) -> None:
        async with self._lock:
            sender = self._session_for_socket_unlocked(sender_socket)
            room = self.rooms.get(message.room_id)
            recipients = [
                session for session in room.sessions.values() if session.in_meeting
            ] if room else []
            if not sender or not room or sender.room_id != message.room_id:
                return
            if not room.translation_enabled:
                self._enqueue(
                    sender,
                    json.dumps(
                        {
                            "type": "translation_disabled",
                            "room_id": message.room_id,
                            "message": "Live translation is disabled by an administrator.",
                            "timestamp": utc_timestamp(),
                        }
                    ),
                    event="translation_disabled",
                )
                return
            if not sender.in_meeting:
                self._log_voice_event(
                    "chunk_rejected",
                    session=sender,
                    sequence=message.sequence,
                    reason="sender_not_in_meeting",
                )
                return

        try:
            sender.voice_chunk_queue.put_nowait(message)
        except asyncio.QueueFull:
            self._send_voice_status(
                sender,
                "Speech processing is behind. Pause briefly and continue.",
                level="error",
                sequence=message.sequence,
            )
            self._log_voice_event(
                "chunk_queue_full",
                session=sender,
                sequence=message.sequence,
                queue_size=sender.voice_chunk_queue.qsize(),
            )
            return

        for receiver in recipients:
            self._send_translation_status(
                receiver,
                sender=sender,
                detected_language=sender.preferred_language,
                target_language=receiver.preferred_language,
                sequence=message.sequence,
                stage="listening",
                status="success",
                message="Speech segment captured.",
            )
        self._log_voice_event(
            "chunk_queued",
            session=sender,
            sequence=message.sequence,
            queue_size=sender.voice_chunk_queue.qsize(),
        )

    async def broadcast_voice_activity(
        self,
        sender_socket: WebSocket,
        message: IncomingVoiceActivityMessage,
    ) -> None:
        async with self._lock:
            sender = self._session_for_socket_unlocked(sender_socket)
            room = self.rooms.get(message.room_id)
            recipients = [
                session for session in room.sessions.values() if session.in_meeting
            ] if room else []
            if not sender or not room or sender.room_id != message.room_id:
                return
            if not sender.in_meeting:
                return

        for receiver in recipients:
            self._send_translation_status(
                receiver,
                sender=sender,
                detected_language=sender.preferred_language,
                target_language=receiver.preferred_language,
                sequence=message.sequence,
                stage="listening",
                status="started" if message.active else "success",
                message="Speaker is talking." if message.active else "Speech segment ended.",
            )

    async def _voice_worker(self, session: ClientSession) -> None:
        while True:
            message = await session.voice_chunk_queue.get()
            try:
                if message is None:
                    return
                await self._process_voice_chunk(session.websocket, message)
            except Exception as exc:
                self._log_voice_event(
                    "worker_failure",
                    session=session,
                    error=str(exc),
                )
                self._send_voice_status(
                    session,
                    "The speech translation pipeline failed for this segment.",
                    level="error",
                    sequence=message.sequence if message else None,
                )
            finally:
                session.voice_chunk_queue.task_done()

    async def _process_voice_chunk(
        self,
        sender_socket: WebSocket,
        message: IncomingVoiceChunkMessage,
    ) -> None:
        started = perf_counter()
        async with self._lock:
            sender = self._session_for_socket_unlocked(sender_socket)
            room = self.rooms.get(message.room_id)
            recipients = [
                session for session in room.sessions.values() if session.in_meeting
            ] if room else []

            if not sender or not room or sender.room_id != message.room_id:
                return
            if not sender.in_meeting:
                return

            sender.voice_chunk_in_progress = True

        try:
            try:
                audio_bytes = base64.b64decode(message.audio_base64, validate=True)
            except (binascii.Error, ValueError) as exc:
                self._log_voice_event(
                    "invalid_chunk",
                    session=sender,
                    sequence=message.sequence,
                    error=str(exc),
                )
                self._send_voice_status(
                    sender,
                    "Could not read that audio chunk.",
                    level="error",
                    sequence=message.sequence,
                )
                return

            for receiver in recipients:
                self._send_translation_status(
                    receiver,
                    sender=sender,
                    detected_language=sender.preferred_language,
                    target_language=receiver.preferred_language,
                    sequence=message.sequence,
                    stage="stt",
                    status="started",
                    message="Transcribing speech.",
                )

            try:
                stt_result = await asyncio.wait_for(
                    stt_service.transcribe(audio_bytes, message.mime_type),
                    timeout=VOICE_TRANSCRIPTION_TIMEOUT_SECONDS,
                )
            except asyncio.TimeoutError:
                self._log_voice_event(
                    "stt_timeout",
                    session=sender,
                    sequence=message.sequence,
                    timeout_seconds=VOICE_TRANSCRIPTION_TIMEOUT_SECONDS,
                )
                self._send_voice_status(
                    sender,
                    "Whisper is still loading or downloading. Try again after it finishes.",
                    level="error",
                    sequence=message.sequence,
                )
                return
            except Exception as exc:
                self._log_voice_event(
                    "stt_failure",
                    session=sender,
                    sequence=message.sequence,
                    error=str(exc),
                )
                self._send_voice_status(
                    sender,
                    f"Speech-to-text failed: {exc}",
                    level="error",
                    sequence=message.sequence,
                )
                return

            transcript = stt_result.text.strip()
            if not transcript:
                self._log_voice_event(
                    "empty_transcript",
                    session=sender,
                    sequence=message.sequence,
                    stt_latency_ms=stt_result.latency_ms,
                    provider=stt_result.provider,
                )
                self._send_voice_status(
                    sender,
                    "No speech detected in the last audio chunk.",
                    level="info",
                    sequence=message.sequence,
                )
                return

            detection = await detect_language_profile(
                transcript,
                language_hint=stt_result.language or sender.preferred_language,
            )
            source_language = normalize_language(detection.language)
            for receiver in recipients:
                self._send_translation_status(
                    receiver,
                    sender=sender,
                    detected_language=source_language,
                    target_language=receiver.preferred_language,
                    sequence=message.sequence,
                    stage="stt",
                    status="success",
                    latency_ms=stt_result.latency_ms,
                    message="Transcript ready.",
                )
            result_by_language: dict[str, TranslationResult] = {}
            latency_by_language: dict[str, int] = {}
            translation_recipients = [
                receiver
                for receiver in recipients
                if receiver.listener_mode != "original_audio_only"
            ]

            async def result_for_language(target_language: str) -> TranslationResult:
                target = normalize_language(target_language)
                cached_result = result_by_language.get(target)
                if cached_result:
                    return cached_result

                target_receivers = [
                    receiver
                    for receiver in translation_recipients
                    if normalize_language(receiver.preferred_language) == target
                ]
                for receiver in target_receivers:
                    self._send_translation_status(
                        receiver,
                        sender=sender,
                        detected_language=source_language,
                        target_language=target,
                        sequence=message.sequence,
                        stage="translation",
                        status="started",
                        message="Translating transcript.",
                    )

                translation_started = perf_counter()
                if target == source_language:
                    result = TranslationResult(
                        original=transcript,
                        translated=transcript,
                        source_language=source_language,
                        target_language=target,
                        status="skipped_same_language",
                        mixed_language=detection.mixed_language,
                    )
                    log_translation_event("translation.skipped", result=result)
                else:
                    result = await translate_text(
                        text=transcript,
                        target_lang=target,
                        source_lang=source_language,
                        mixed_language=detection.mixed_language,
                        context=TranslationContext(
                            speaker_language=source_language,
                            target_language=target,
                            speaker_pronouns=sender.pronouns,
                            speaker_voice_preference=sender.voice_preference,
                            speaker_session_id=sender.session_id,
                        ),
                    )

                latency_by_language[target] = int((perf_counter() - translation_started) * 1000)
                result_by_language[target] = result
                return result

            target_languages = {
                normalize_language(session.preferred_language)
                for session in translation_recipients
            }
            await asyncio.gather(
                *(result_for_language(language) for language in target_languages)
            )

            audio_targets_by_language: dict[str, list[ClientSession]] = {}

            for receiver in translation_recipients:
                result = await result_for_language(receiver.preferred_language)
                total_latency_ms = int((perf_counter() - started) * 1000)
                self._send_translation_status(
                    receiver,
                    sender=sender,
                    detected_language=result.source_language,
                    target_language=result.target_language,
                    sequence=message.sequence,
                    stage="translation",
                    status="success" if not result.error else "failed",
                    latency_ms=latency_by_language.get(result.target_language, 0),
                    message=(
                        "Translation is unavailable for this language pair."
                        if result.error
                        else None
                    ),
                )

                if realtime_translation_service.should_send_transcript(receiver.listener_mode):
                    payload = TranslatedTranscriptMessage.create(
                        room_id=message.room_id,
                        sender_session_id=sender.session_id,
                        sender=sender.username,
                        original=transcript,
                        translated=result.translated,
                        detected_language=result.source_language,
                        target_language=result.target_language,
                        sequence=message.sequence,
                        stt_provider=stt_result.provider,
                        stt_latency_ms=stt_result.latency_ms,
                        translation_latency_ms=latency_by_language.get(result.target_language, 0),
                        total_latency_ms=total_latency_ms,
                        translation_status=result.status,
                        translation_error=result.error,
                    )
                    self._enqueue(receiver, payload.model_dump_json(), event="voice_transcript")

                should_send_audio = (
                    receiver.session_id != sender.session_id
                    and realtime_translation_service.should_send_translated_audio(
                        receiver.listener_mode
                    )
                    and result.target_language != source_language
                    and result.translated.strip()
                    and result.status == "success"
                )
                if should_send_audio:
                    audio_targets_by_language.setdefault(result.target_language, []).append(receiver)

            for target_language, target_sessions in audio_targets_by_language.items():
                result = await result_for_language(target_language)
                asyncio.create_task(
                    self._deliver_translation_audio(
                        room_id=message.room_id,
                        sender=sender,
                        receivers=target_sessions,
                        translated_text=result.translated,
                        detected_language=source_language,
                        target_language=target_language,
                        sequence=message.sequence,
                        started_at=started,
                        stt_latency_ms=stt_result.latency_ms,
                        translation_latency_ms=latency_by_language.get(target_language, 0),
                        transcript=transcript,
                        duration_seconds=stt_result.duration_seconds,
                    )
                )

            self._log_voice_event(
                "transcript_broadcast",
                session=sender,
                sequence=message.sequence,
                detected_language=source_language,
                recipient_count=len(recipients),
                stt_latency_ms=stt_result.latency_ms,
                total_latency_ms=int((perf_counter() - started) * 1000),
            )
        finally:
            async with self._lock:
                if sender.session_id in self.sessions:
                    sender.voice_chunk_in_progress = False

    async def _stop_voice_worker(self, session: ClientSession) -> None:
        task = session.voice_worker_task
        if not task:
            return
        with contextlib.suppress(asyncio.QueueFull):
            session.voice_chunk_queue.put_nowait(None)
        with contextlib.suppress(asyncio.TimeoutError):
            await asyncio.wait_for(task, timeout=DELIVERY_TIMEOUT_SECONDS)
        if not task.done():
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task

    async def _deliver_translation_audio(
        self,
        room_id: str,
        sender: ClientSession,
        receivers: list[ClientSession],
        translated_text: str,
        detected_language: str,
        target_language: str,
        sequence: int,
        started_at: float,
        stt_latency_ms: int,
        translation_latency_ms: int,
        transcript: str,
        duration_seconds: float,
    ) -> None:
        active_receivers = [receiver for receiver in receivers if receiver.connected]
        if not active_receivers:
            return

        for receiver in active_receivers:
            self._send_translation_status(
                receiver,
                sender=sender,
                detected_language=detected_language,
                target_language=target_language,
                sequence=sequence,
                stage="tts",
                status="started",
                message="Generating translated audio.",
            )

        try:
            audio = await realtime_translation_service.synthesize_audio(
                translated_text,
                target_language,
                source_language=detected_language,
                sequence=sequence,
                sender_session_id=sender.session_id,
                speaker_voice_preference=sender.voice_preference,
            )
        except Exception as exc:
            for receiver in active_receivers:
                self._send_translation_status(
                    receiver,
                    sender=sender,
                    detected_language=detected_language,
                    target_language=target_language,
                    sequence=sequence,
                    stage="tts",
                    status="failed",
                    message=str(exc),
                )
            self._log_voice_event(
                "translated_audio_failed",
                session=sender,
                sequence=sequence,
                detected_language=detected_language,
                target_language=target_language,
                recipient_count=len(active_receivers),
                error=str(exc),
            )
            # Log failure to translation_logs and update stats
            try:
                db = get_db()
                room_repo = RoomRepository(db)
                trans_log_repo = TranslationLogRepository(db)
                await trans_log_repo.log(
                    room_id=room_id,
                    speaker=sender.username,
                    source_language=detected_language,
                    target_language=target_language,
                    transcript=transcript,
                    translated_text=translated_text,
                    latency_ms=int((perf_counter() - started_at) * 1000),
                    cache_hit=False,
                    voice_model=None,
                    translation_success=False,
                )
                await room_repo.update_translation_stats(
                    room_id=room_id,
                    success=False,
                    cache_hit=False
                )
            except Exception as e:
                logger.error(f"Error persisting speech translation failure: {e}")
            return

        for receiver in active_receivers:
            payload = TranslationAudioMessage.create(
                room_id=room_id,
                sender_session_id=sender.session_id,
                sender=sender.username,
                detected_language=detected_language,
                target_language=target_language,
                translated_text=translated_text,
                audio_base64=audio.audio_base64,
                mime_type=audio.mime_type,
                sequence=sequence,
                stt_latency_ms=stt_latency_ms,
                translation_latency_ms=translation_latency_ms,
                tts_latency_ms=audio.tts_latency_ms,
                total_latency_ms=int((perf_counter() - started_at) * 1000),
                provider=audio.provider,
            )
            self._enqueue(receiver, payload.model_dump_json(), event="translation_audio")
            self._send_translation_status(
                receiver,
                sender=sender,
                detected_language=detected_language,
                target_language=target_language,
                sequence=sequence,
                stage="tts",
                status="success",
                latency_ms=audio.tts_latency_ms,
                message="Translated audio ready.",
            )
            self._send_translation_status(
                receiver,
                sender=sender,
                detected_language=detected_language,
                target_language=target_language,
                sequence=sequence,
                stage="delivery",
                status="success",
                latency_ms=int((perf_counter() - started_at) * 1000),
                message="Translated audio delivered.",
            )

        self._log_voice_event(
            "translated_audio_delivered",
            session=sender,
            sequence=sequence,
            detected_language=detected_language,
            target_language=target_language,
            recipient_count=len(active_receivers),
            tts_latency_ms=audio.tts_latency_ms,
            total_latency_ms=int((perf_counter() - started_at) * 1000),
        )

        # Log success to translation_logs and update voice statistics
        try:
            db = get_db()
            room_repo = RoomRepository(db)
            trans_log_repo = TranslationLogRepository(db)
            
            await room_repo.update_voice_seconds(room_id, duration_seconds)
            await trans_log_repo.log(
                room_id=room_id,
                speaker=sender.username,
                source_language=detected_language,
                target_language=target_language,
                transcript=transcript,
                translated_text=translated_text,
                latency_ms=int((perf_counter() - started_at) * 1000),
                cache_hit=False,
                voice_model=getattr(audio, "selected_model", None),
                translation_success=True,
            )
            await room_repo.update_translation_stats(
                room_id=room_id,
                success=True,
                cache_hit=False
            )
        except Exception as e:
            logger.error(f"Error persisting speech translation success: {e}")

    async def relay_signaling(
        self,
        sender_socket: WebSocket,
        message: IncomingSignalingMessage,
    ) -> bool:
        async with self._lock:
            sender = self._session_for_socket_unlocked(sender_socket)
            if not sender or sender.room_id != message.room_id:
                return False

            room = self.rooms.get(message.room_id)
            if not room:
                self._log_signaling_event(
                    "relay_rejected",
                    session=sender,
                    target_session_id=message.target_session_id,
                    signaling_type=message.type,
                    reason="room_not_found",
                )
                return False

            if message.type in {"call_started", "call_ended"}:
                if message.type == "call_started":
                    sender.in_meeting = True
                    room.meeting_active = True
                    room.meeting_host_session_id = sender.session_id
                    room.meeting_media_type = (
                        message.payload.get("media_type", "video")
                        if isinstance(message.payload, dict)
                        else "video"
                    )
                else:
                    reason = (
                        message.payload.get("reason")
                        if isinstance(message.payload, dict)
                        else None
                    )
                    ending_room_meeting = (
                        sender.session_id == room.meeting_host_session_id
                        or reason in {"room_call_ended", "host_disconnected"}
                    )
                    sender.in_meeting = False
                    if ending_room_meeting:
                        room.meeting_active = False
                        room.meeting_host_session_id = None
                        for session in room.sessions.values():
                            session.in_meeting = False
                    for session in room.sessions.values():
                        if session.session_id == sender.session_id:
                            continue
                        if session.active_peer_session_id == sender.session_id:
                            session.active_peer_session_id = None
                    sender.active_peer_session_id = None

                recipients = [
                    session
                    for session in room.sessions.values()
                    if session.session_id != sender.session_id
                ]
                outgoing = OutgoingSignalingMessage.create(
                    message_type=message.type,
                    room_id=message.room_id,
                    sender_session_id=sender.session_id,
                    sender_name=sender.username,
                    payload=message.payload,
                )
                payload = outgoing.model_dump_json()
                event_name = "call_started" if message.type == "call_started" else "call_ended"
                self._log_signaling_event(
                    event_name,
                    session=sender,
                    target_session_id=None,
                    recipient_count=len(recipients),
                )

                delivered = False
                for recipient in recipients:
                    delivered = self._enqueue(recipient, payload, event=message.type) or delivered
                return delivered

            target = self.sessions.get(message.target_session_id)

            if (
                not target
                or target.room_id != message.room_id
                or sender.session_id == target.session_id
            ):
                if sender:
                    self._log_signaling_event(
                        "relay_rejected",
                        session=sender,
                        target_session_id=message.target_session_id,
                        signaling_type=message.type,
                        reason="invalid_target",
                    )
                return False

            if message.type in {"webrtc_offer", "webrtc_answer"}:
                sender.in_meeting = True
                target.in_meeting = True

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

    async def apply_admin_command(self, command: dict) -> dict:
        command_type = command.get("command_type")
        room_id = command.get("room_id")
        target_session_id = command.get("target_session_id")
        target_user_id = command.get("target_user_id")
        payload = command.get("payload") if isinstance(command.get("payload"), dict) else {}
        command_id = command.get("command_id")

        # Global commands that don't target a specific room or session
        if command_type == "UPDATE_FEATURE_FLAGS":
            from app.runtime_settings import runtime_settings
            key = payload.get("key")
            enabled = payload.get("enabled", True)
            runtime_settings.update_feature_flag(key, enabled)
            
            # Broadcast to all connected clients
            broadcast_payload = json.dumps({
                "type": "feature_flag_update",
                "key": key,
                "enabled": enabled,
                "timestamp": time.time()
            })
            async with self._lock:
                for session in self.sessions.values():
                    self._enqueue(session, broadcast_payload, event="feature_flag_update")
            return self._ack(command, "SUCCESS", f"Feature flag {key} set to {enabled} globally.")

        if command_type == "UPDATE_LANGUAGE":
            from app.runtime_settings import runtime_settings
            code = payload.get("code")
            enabled = payload.get("enabled", True)
            runtime_settings.update_language(code, enabled)
            return self._ack(command, "SUCCESS", f"Language {code} set to {enabled} globally.")

        if command_type == "UPDATE_SETTINGS":
            from app.runtime_settings import runtime_settings
            key = payload.get("key")
            values = payload.get("values", {})
            runtime_settings.update_settings(key, values)
            
            # If Whisper model has changed, trigger STT reload!
            if key == "translation" and "stt_model" in values:
                from app.stt.service import stt_service
                new_model = values["stt_model"]
                await stt_service.update_model(new_model)
                
            return self._ack(command, "SUCCESS", f"Settings updated for {key} category.")

        async with self._lock:
            room = self.rooms.get(room_id) if room_id else None
            target = self.sessions.get(target_session_id) if target_session_id else None
            if not target and target_user_id:
                target = next((session for session in self.sessions.values() if session.user_id == target_user_id), None)
            if not room and target:
                room = self.rooms.get(target.room_id)

            if command_type in {"FORCE_LOGOUT", "REMOVE_USER", "BAN_USER"}:
                targets = [target] if target else [
                    session for session in self.sessions.values() if session.user_id == target_user_id
                ]
                if not targets:
                    return self._ack(command, "NOT_CONNECTED", "Target user is not connected.")
                for session in targets:
                    self._enqueue(session, self._admin_event_payload("force_logout", session.room_id, command, payload), event="force_logout")
                return self._ack(command, "SUCCESS", f"{len(targets)} active session(s) notified.")

            if not room:
                return self._ack(command, "ROOM_NOT_FOUND", "Room is not active on this backend.")

            room_sessions = list(room.sessions.values())

            if command_type == "END_MEETING":
                room.meeting_active = False
                room.meeting_host_session_id = None
                for session in room_sessions:
                    session.in_meeting = False
                    session.active_peer_session_id = None
                    self._enqueue(session, self._admin_event_payload("meeting_ended", room.room_id, command, payload), event="meeting_ended")
                return self._ack(command, "SUCCESS", f"Meeting ended for {len(room_sessions)} connected participant(s).")

            if command_type == "LOCK_MEETING":
                room.locked = True
                event_name = "room_locked"
            elif command_type == "UNLOCK_MEETING":
                room.locked = False
                event_name = "room_unlocked"
            elif command_type == "DISABLE_CHAT":
                room.chat_enabled = False
                event_name = "chat_disabled"
            elif command_type == "ENABLE_CHAT":
                room.chat_enabled = True
                event_name = "chat_enabled"
            elif command_type == "DISABLE_TRANSLATION":
                room.translation_enabled = False
                event_name = "translation_disabled"
            elif command_type == "ENABLE_TRANSLATION":
                room.translation_enabled = True
                event_name = "translation_enabled"
            elif command_type == "MUTE_ALL":
                event_name = "mute_all"
            elif command_type == "FORCE_RECONNECT":
                event_name = "force_reconnect"
            elif command_type == "SEND_SYSTEM_NOTIFICATION":
                event_name = "system_notification"
            elif command_type in {"KICK_PARTICIPANT", "MUTE_PARTICIPANT", "UNMUTE_PARTICIPANT"}:
                if not target or target.room_id != room.room_id:
                    return self._ack(command, "NOT_CONNECTED", "Target participant is not connected to this room.")
                event_name = {
                    "KICK_PARTICIPANT": "participant_kicked",
                    "MUTE_PARTICIPANT": "participant_muted",
                    "UNMUTE_PARTICIPANT": "participant_unmuted",
                }[command_type]
                self._enqueue(target, self._admin_event_payload(event_name, room.room_id, command, payload), event=event_name)
                return self._ack(command, "SUCCESS", f"{event_name} delivered to {target.username}.")
            else:
                return self._ack(command, "FAILED", f"Unsupported admin command: {command_type}")

            admin_payload = self._admin_event_payload(event_name, room.room_id, command, payload)
            for session in room_sessions:
                self._enqueue(session, admin_payload, event=event_name)
            return self._ack(command, "SUCCESS", f"{event_name} delivered to {len(room_sessions)} participant(s).")

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

    def _admin_event_payload(self, event_type: str, room_id: str, command: dict, payload: dict) -> str:
        return json.dumps(
            {
                "type": event_type,
                "room_id": room_id,
                "command_id": command.get("command_id"),
                "message": payload.get("message") or payload.get("reason") or "Administrative action applied.",
                "target_session_id": command.get("target_session_id"),
                "target_user_id": command.get("target_user_id"),
                "payload": payload,
                "timestamp": utc_timestamp(),
            },
            ensure_ascii=False,
        )

    def _ack(self, command: dict, status: str, message: str) -> dict:
        return {
            "command_id": command.get("command_id"),
            "command_type": command.get("command_type"),
            "room_id": command.get("room_id"),
            "target_session_id": command.get("target_session_id"),
            "target_user_id": command.get("target_user_id"),
            "status": status,
            "message": message,
            "acknowledged_at": utc_timestamp(),
        }

    def _send_voice_status(
        self,
        session: ClientSession,
        message: str,
        level: str = "info",
        sequence: int | None = None,
    ) -> None:
        payload = {
            "type": "voice_status",
            "room_id": session.room_id,
            "message": message,
            "level": level,
            "sequence": sequence,
            "timestamp": utc_timestamp(),
        }
        self._enqueue(session, json.dumps(payload), event="voice_status")

    def _send_translation_status(
        self,
        session: ClientSession,
        sender: ClientSession,
        detected_language: str,
        target_language: str,
        sequence: int,
        stage: str,
        status: str,
        latency_ms: int | None = None,
        message: str | None = None,
    ) -> None:
        payload = TranslationStatusMessage.create(
            room_id=session.room_id,
            sender_session_id=sender.session_id,
            sender=sender.username,
            detected_language=detected_language,
            target_language=target_language,
            sequence=sequence,
            stage=stage,
            status=status,
            latency_ms=latency_ms,
            message=message,
        )
        self._enqueue(session, payload.model_dump_json(), event="translation_status")

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
                name=session.name,
                preferred_language=session.preferred_language,
                role=session.role,
                pronouns=session.pronouns,
                voice_preference=session.voice_preference,
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
        session: ClientSession,
        **fields: object,
    ) -> None:
        payload = {
            "event": f"voice_translation.{event}",
            "session_id": session.session_id,
            "room_id": session.room_id,
            "username": session.username,
            **fields,
        }
        logger.info(json.dumps(payload, ensure_ascii=False, sort_keys=True))

    def _log_signaling_event(
        self,
        event: str,
        session: ClientSession,
        target_session_id: str | None,
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
