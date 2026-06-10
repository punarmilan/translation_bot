from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field


UserRole = Literal["admin", "host", "participant"]
ChatDeliveryMode = Literal["broadcast", "direct"]


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


SignalingMessageType = Literal[
    "webrtc_offer",
    "webrtc_answer",
    "webrtc_ice_candidate",
    "call_request",
    "call_accept",
    "call_reject",
    "call_end",
]


class IncomingSignalingMessage(BaseModel):
    type: SignalingMessageType
    room_id: str = Field(min_length=1)
    target_session_id: str = Field(min_length=1)
    payload: dict[str, Any] | None = None


class RoomStats(BaseModel):
    room_id: str
    active_users: int
    message_count: int
    language_distribution: dict[str, int]


class RoomMember(BaseModel):
    session_id: str
    username: str
    preferred_language: str
    role: UserRole


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
    preferred_language: str
    role: UserRole
    timestamp: str
    room_stats: RoomStats
    members: list[RoomMember]

    @classmethod
    def create(
        cls,
        session_id: str,
        room_id: str,
        username: str,
        preferred_language: str,
        role: UserRole,
        room_stats: RoomStats,
        members: list[RoomMember],
    ) -> "ConnectionAckMessage":
        return cls(
            session_id=session_id,
            room_id=room_id,
            username=username,
            preferred_language=preferred_language,
            role=role,
            timestamp=utc_timestamp(),
            room_stats=room_stats,
            members=members,
        )


class OutgoingSignalingMessage(BaseModel):
    type: SignalingMessageType
    room_id: str
    sender_session_id: str
    sender_name: str
    target_session_id: str
    timestamp: str
    payload: dict[str, Any] | None = None

    @classmethod
    def create(
        cls,
        message_type: SignalingMessageType,
        room_id: str,
        sender_session_id: str,
        sender_name: str,
        target_session_id: str,
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
