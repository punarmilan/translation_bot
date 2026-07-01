from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field


UserRole = Literal["admin", "host", "participant"]
ChatDeliveryMode = Literal["broadcast", "direct"]
ListenerMode = Literal[
    "original_audio_only",
    "translated_audio_only",
    "original_transcript",
    "original_translated_audio",
]


def utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


class JoinMessage(BaseModel):
    type: Literal["join"] = "join"
    username: str = Field(min_length=1)
    room_id: str = Field(min_length=1)
    role: UserRole = "participant"


class IncomingChatMessage(BaseModel):
    type: Literal["chat"] = "chat"
    text: str = Field(min_length=1)
    sender_name: str = Field(min_length=1)
    room_id: str = Field(min_length=1)
    delivery_mode: ChatDeliveryMode = "broadcast"
    target_session_id: str | None = None


class IncomingVoiceChunkMessage(BaseModel):
    type: Literal["voice_chunk"] = "voice_chunk"
    room_id: str = Field(min_length=1)
    audio_base64: str = Field(min_length=1)
    mime_type: str = "audio/webm"
    sequence: int = Field(ge=0)
    captured_at: str | None = None


class IncomingVoiceActivityMessage(BaseModel):
    type: Literal["voice_activity"] = "voice_activity"
    room_id: str = Field(min_length=1)
    active: bool
    sequence: int = Field(ge=0)


class IncomingLanguageUpdateMessage(BaseModel):
    type: Literal["language_update"] = "language_update"
    room_id: str = Field(min_length=1)
    preferred_language: str = Field(min_length=2, max_length=12)


class IncomingListenerPreferencesMessage(BaseModel):
    type: Literal["listener_preferences"] = "listener_preferences"
    room_id: str = Field(min_length=1)
    listener_mode: ListenerMode


SignalingMessageType = Literal[
    "webrtc_offer",
    "webrtc_answer",
    "webrtc_ice_candidate",
    "call_started",
    "call_ended",
    "call_request",
    "call_accept",
    "call_reject",
    "call_end",
]


class IncomingSignalingMessage(BaseModel):
    type: SignalingMessageType
    room_id: str = Field(min_length=1)
    target_session_id: str | None = None
    payload: dict[str, Any] | None = None


class RoomStats(BaseModel):
    room_id: str
    active_users: int
    message_count: int
    language_distribution: dict[str, int]


class RoomMember(BaseModel):
    session_id: str
    username: str
    name: str | None = None
    preferred_language: str
    role: UserRole
    pronouns: str | None = None
    voice_preference: str = "auto"


class RoomPresenceMessage(BaseModel):
    type: Literal["room_presence"] = "room_presence"
    room_id: str
    timestamp: str
    members: list[RoomMember]
    room_stats: RoomStats

    @classmethod
    def create(
        cls,
        room_id: str,
        members: list[RoomMember],
        room_stats: RoomStats,
    ) -> "RoomPresenceMessage":
        return cls(
            room_id=room_id,
            timestamp=utc_timestamp(),
            members=members,
            room_stats=room_stats,
        )


class ConnectionAckMessage(BaseModel):
    type: Literal["connection_ack"] = "connection_ack"
    session_id: str
    room_id: str
    username: str
    name: str | None = None
    preferred_language: str
    role: UserRole
    pronouns: str | None = None
    voice_preference: str = "auto"
    timestamp: str
    room_stats: RoomStats
    members: list[RoomMember]

    @classmethod
    def create(
        cls,
        session_id: str,
        room_id: str,
        username: str,
        name: str | None,
        preferred_language: str,
        role: UserRole,
        pronouns: str | None,
        voice_preference: str,
        room_stats: RoomStats,
        members: list[RoomMember],
    ) -> "ConnectionAckMessage":
        return cls(
            session_id=session_id,
            room_id=room_id,
            username=username,
            name=name,
            preferred_language=preferred_language,
            role=role,
            pronouns=pronouns,
            voice_preference=voice_preference,
            timestamp=utc_timestamp(),
            room_stats=room_stats,
            members=members,
        )


class OutgoingSignalingMessage(BaseModel):
    type: SignalingMessageType
    room_id: str
    sender_session_id: str
    sender_name: str
    target_session_id: str | None = None
    timestamp: str
    payload: dict[str, Any] | None = None

    @classmethod
    def create(
        cls,
        message_type: SignalingMessageType,
        room_id: str,
        sender_session_id: str,
        sender_name: str,
        target_session_id: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> "OutgoingSignalingMessage":
        return cls(
            type=message_type,
            room_id=room_id,
            sender_session_id=sender_session_id,
            sender_name=sender_name,
            target_session_id=target_session_id,
            timestamp=utc_timestamp(),
            payload=payload,
        )


class TranslatedChatMessage(BaseModel):
    type: Literal["message"] = "message"
    message_kind: Literal["text"] = "text"
    room_id: str
    sender_session_id: str
    sender_role: UserRole
    delivery_mode: ChatDeliveryMode
    target_session_id: str | None = None
    target_name: str | None = None
    original: str
    translated: str
    sender: str
    timestamp: str
    detected_language: str
    target_language: str
    translation_status: str
    translation_error: str | None = None
    cache_hit: bool = False
    mixed_language: bool = False

    @classmethod
    def create(
        cls,
        room_id: str,
        sender_session_id: str,
        sender_role: UserRole,
        delivery_mode: ChatDeliveryMode,
        original: str,
        translated: str,
        sender: str,
        detected_language: str,
        target_language: str,
        translation_status: str,
        timestamp: str,
        target_session_id: str | None = None,
        target_name: str | None = None,
        translation_error: str | None = None,
        cache_hit: bool = False,
        mixed_language: bool = False,
    ) -> "TranslatedChatMessage":
        return cls(
            room_id=room_id,
            sender_session_id=sender_session_id,
            sender_role=sender_role,
            delivery_mode=delivery_mode,
            target_session_id=target_session_id,
            target_name=target_name,
            original=original,
            translated=translated,
            sender=sender,
            timestamp=timestamp,
            detected_language=detected_language,
            target_language=target_language,
            translation_status=translation_status,
            translation_error=translation_error,
            cache_hit=cache_hit,
            mixed_language=mixed_language,
        )


class TranslatedTranscriptMessage(BaseModel):
    type: Literal["voice_transcript"] = "voice_transcript"
    room_id: str
    sender_session_id: str
    sender: str
    original: str
    translated: str
    detected_language: str
    target_language: str
    timestamp: str
    sequence: int
    stt_provider: str
    stt_latency_ms: int
    translation_latency_ms: int
    total_latency_ms: int
    translation_status: str
    translation_error: str | None = None

    @classmethod
    def create(
        cls,
        room_id: str,
        sender_session_id: str,
        sender: str,
        original: str,
        translated: str,
        detected_language: str,
        target_language: str,
        sequence: int,
        stt_provider: str,
        stt_latency_ms: int,
        translation_latency_ms: int,
        total_latency_ms: int,
        translation_status: str,
        translation_error: str | None = None,
    ) -> "TranslatedTranscriptMessage":
        return cls(
            room_id=room_id,
            sender_session_id=sender_session_id,
            sender=sender,
            original=original,
            translated=translated,
            detected_language=detected_language,
            target_language=target_language,
            timestamp=utc_timestamp(),
            sequence=sequence,
            stt_provider=stt_provider,
            stt_latency_ms=stt_latency_ms,
            translation_latency_ms=translation_latency_ms,
            total_latency_ms=total_latency_ms,
            translation_status=translation_status,
            translation_error=translation_error,
        )


class TranslationAudioMessage(BaseModel):
    type: Literal["translation_audio"] = "translation_audio"
    room_id: str
    sender_session_id: str
    sender: str
    detected_language: str
    target_language: str
    translated_text: str
    audio_base64: str
    mime_type: str
    timestamp: str
    sequence: int
    stt_latency_ms: int
    translation_latency_ms: int
    tts_latency_ms: int
    total_latency_ms: int
    provider: str

    @classmethod
    def create(
        cls,
        room_id: str,
        sender_session_id: str,
        sender: str,
        detected_language: str,
        target_language: str,
        translated_text: str,
        audio_base64: str,
        mime_type: str,
        sequence: int,
        stt_latency_ms: int,
        translation_latency_ms: int,
        tts_latency_ms: int,
        total_latency_ms: int,
        provider: str,
    ) -> "TranslationAudioMessage":
        return cls(
            room_id=room_id,
            sender_session_id=sender_session_id,
            sender=sender,
            detected_language=detected_language,
            target_language=target_language,
            translated_text=translated_text,
            audio_base64=audio_base64,
            mime_type=mime_type,
            timestamp=utc_timestamp(),
            sequence=sequence,
            stt_latency_ms=stt_latency_ms,
            translation_latency_ms=translation_latency_ms,
            tts_latency_ms=tts_latency_ms,
            total_latency_ms=total_latency_ms,
            provider=provider,
        )


class TranslationStatusMessage(BaseModel):
    type: Literal["translation_status"] = "translation_status"
    room_id: str
    sender_session_id: str
    sender: str
    detected_language: str
    target_language: str
    sequence: int
    stage: Literal["listening", "stt", "translation", "tts", "delivery"]
    status: Literal["started", "success", "skipped", "failed"]
    timestamp: str
    latency_ms: int | None = None
    message: str | None = None

    @classmethod
    def create(
        cls,
        room_id: str,
        sender_session_id: str,
        sender: str,
        detected_language: str,
        target_language: str,
        sequence: int,
        stage: Literal["listening", "stt", "translation", "tts", "delivery"],
        status: Literal["started", "success", "skipped", "failed"],
        latency_ms: int | None = None,
        message: str | None = None,
    ) -> "TranslationStatusMessage":
        return cls(
            room_id=room_id,
            sender_session_id=sender_session_id,
            sender=sender,
            detected_language=detected_language,
            target_language=target_language,
            sequence=sequence,
            stage=stage,
            status=status,
            timestamp=utc_timestamp(),
            latency_ms=latency_ms,
            message=message,
        )


class SystemMessage(BaseModel):
    type: Literal["system"] = "system"
    room_id: str
    text: str
    timestamp: str
    room_stats: RoomStats | None = None

    @classmethod
    def create(
        cls,
        room_id: str,
        text: str,
        room_stats: RoomStats | None = None,
    ) -> "SystemMessage":
        return cls(
            room_id=room_id,
            text=text,
            timestamp=utc_timestamp(),
            room_stats=room_stats,
        )
