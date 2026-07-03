import asyncio
import base64
import hashlib
import hmac
import json
import logging
import time
from typing import Optional

from pydantic import ValidationError

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from app.auth.dependencies import get_current_user, require_role
from app.auth.service import decode_token
from app.config import get_settings
from app.database import get_db
from app.repositories.message_repository import MessageRepository
from app.repositories.user_repository import UserRepository
from app.schemas import (
    IncomingChatMessage,
    IncomingLanguageUpdateMessage,
    IncomingListenerPreferencesMessage,
    IncomingSignalingMessage,
    IncomingVoiceActivityMessage,
    IncomingVoiceChunkMessage,
    JoinMessage,
    RoomStats,
)
from app.stt.service import stt_service
from app.tts.service import tts_service
from app.translation.service import SUPPORTED_LANGUAGES, normalize_language
from app.websocket_manager import RoomConnectionManager


router = APIRouter()
manager = RoomConnectionManager()
logger = logging.getLogger(__name__)
SIGNALING_TYPES = {
    "webrtc_offer",
    "webrtc_answer",
    "webrtc_ice_candidate",
    "call_started",
    "call_ended",
    "call_request",
    "call_accept",
    "call_reject",
    "call_end",
}
VOICE_TYPES = {"voice_chunk", "voice_activity"}
LANGUAGE_TYPES = {"language_update"}
PREFERENCE_TYPES = {"listener_preferences"}


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=800)
    language: str | None = None
    voice_preference: str | None = "auto"
    speech_profile: str = "natural"


class TTSResponse(BaseModel):
    audio_base64: str
    mime_type: str
    provider: str
    latency_ms: int
    requested_voice: str
    selected_voice: str
    selected_model: str
    output_file: str
    speech_profile: str
    fallback_used: bool


@router.get("/webrtc/ice-servers")
async def webrtc_ice_servers(
    current_user: dict = Depends(get_current_user),
) -> dict:
    settings = get_settings()
    ice_servers: list[dict] = [{"urls": ["stun:stun.l.google.com:19302"]}]
    expires_at: int | None = None

    if settings.TURN_HOST and settings.TURN_SHARED_SECRET:
        expires_at = int(time.time()) + settings.TURN_CREDENTIAL_TTL_SECONDS
        username = f"{expires_at}:{current_user['_id']}"
        digest = hmac.new(
            settings.TURN_SHARED_SECRET.encode("utf-8"),
            username.encode("utf-8"),
            hashlib.sha1,
        ).digest()
        credential = base64.b64encode(digest).decode("ascii")
        host = settings.TURN_HOST
        port = settings.TURN_PORT
        ice_servers.append(
            {
                "urls": [
                    f"turn:{host}:{port}?transport=udp",
                    f"turn:{host}:{port}?transport=tcp",
                ],
                "username": username,
                "credential": credential,
            }
        )

    return {"iceServers": ice_servers, "expiresAt": expires_at}


@router.get("/stt/status")
async def stt_status() -> dict:
    return stt_service.status()


@router.post("/stt/warmup")
async def stt_warmup() -> dict:
    try:
        return await stt_service.warmup()
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"STT warmup failed: {exc}",
        ) from exc


@router.get("/tts/status")
async def tts_status() -> dict:
    return tts_service.status()


@router.post("/tts/synthesize", response_model=TTSResponse)
async def synthesize_tts(
    body: TTSRequest,
    _: dict = Depends(get_current_user),
) -> TTSResponse:
    try:
        result = await tts_service.synthesize(
            text=body.text,
            language=normalize_language(body.language or "en"),
            voice_preference=body.voice_preference or "auto",
            speech_profile=body.speech_profile,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"TTS synthesis failed: {exc}",
        ) from exc

    return TTSResponse(
        audio_base64=base64.b64encode(result.audio_bytes).decode("ascii"),
        mime_type=result.mime_type,
        provider=result.provider,
        latency_ms=result.latency_ms,
        requested_voice=result.requested_voice,
        selected_voice=result.selected_voice,
        selected_model=result.selected_model,
        output_file=result.output_file,
        speech_profile=result.speech_profile,
        fallback_used=result.fallback_used,
    )


async def _get_user_from_token(token: Optional[str]) -> Optional[dict]:
    if not token:
        return None
    payload = decode_token(token)
    if not payload:
        return None
    db = get_db()
    repo = UserRepository(db)
    return await repo.get_by_id(payload.get("sub", ""))


@router.websocket("/ws/{room_id}/{user_lang}")
async def websocket_room_chat(
    websocket: WebSocket,
    room_id: str,
    user_lang: str,
    token: Optional[str] = Query(default=None),
) -> None:
    await websocket.accept()
    registered = False
    current_user = await _get_user_from_token(token)
    if not current_user:
        await websocket.close(code=1008, reason="Authentication required")
        return
    user_id = str(current_user["_id"])
    authenticated_username = current_user["username"]
    requested_language = normalize_language(user_lang)
    authenticated_language = (
        requested_language
        if requested_language in SUPPORTED_LANGUAGES
        else normalize_language(current_user.get("preferred_language", "en"))
    )
    authenticated_role = current_user.get("role", "participant")

    try:
        join_payload = JoinMessage.model_validate(await websocket.receive_json())
        if join_payload.room_id != room_id:
            await websocket.close(code=1008, reason="Room ID mismatch")
            return

        await manager.connect(
            websocket=websocket,
            room_id=room_id,
            username=authenticated_username,
            name=current_user.get("name") or authenticated_username,
            preferred_language=authenticated_language,
            role=authenticated_role,
            pronouns=current_user.get("pronouns"),
            voice_preference=current_user.get("voice_preference", "auto"),
        )
        registered = True

        while True:
            try:
                raw_payload = await websocket.receive_json()
            except (ValidationError, ValueError) as exc:
                logger.warning(
                    json.dumps(
                        {
                            "event": "transport.invalid_message",
                            "room_id": room_id,
                            "error": str(exc),
                        },
                        sort_keys=True,
                    )
                )
                continue

            if not isinstance(raw_payload, dict):
                logger.warning(
                    json.dumps(
                        {
                            "event": "transport.invalid_message",
                            "room_id": room_id,
                            "error": "payload must be a JSON object",
                        },
                        sort_keys=True,
                    )
                )
                continue

            payload_type = raw_payload.get("type", "chat")
            if payload_type in PREFERENCE_TYPES:
                try:
                    preferences = IncomingListenerPreferencesMessage.model_validate(raw_payload)
                except ValidationError as exc:
                    logger.warning(
                        json.dumps(
                            {
                                "event": "transport.invalid_listener_preferences",
                                "room_id": room_id,
                                "error": str(exc),
                            },
                            sort_keys=True,
                        )
                    )
                    continue

                if preferences.room_id != room_id:
                    logger.warning(
                        json.dumps(
                            {
                                "event": "transport.room_mismatch",
                                "expected_room_id": room_id,
                                "payload_room_id": preferences.room_id,
                            },
                            sort_keys=True,
                        )
                    )
                    continue

                await manager.update_listener_preferences(
                    websocket,
                    preferences.listener_mode,
                )
                continue

            if payload_type in LANGUAGE_TYPES:
                try:
                    language_update = IncomingLanguageUpdateMessage.model_validate(raw_payload)
                except ValidationError as exc:
                    logger.warning(
                        json.dumps(
                            {
                                "event": "transport.invalid_language_update",
                                "room_id": room_id,
                                "error": str(exc),
                            },
                            sort_keys=True,
                        )
                    )
                    continue

                if language_update.room_id != room_id:
                    logger.warning(
                        json.dumps(
                            {
                                "event": "transport.room_mismatch",
                                "expected_room_id": room_id,
                                "payload_room_id": language_update.room_id,
                            },
                            sort_keys=True,
                        )
                    )
                    continue

                await manager.update_session_language(
                    websocket,
                    language_update.preferred_language,
                )
                continue

            if payload_type in VOICE_TYPES:
                if payload_type == "voice_activity":
                    try:
                        voice_activity = IncomingVoiceActivityMessage.model_validate(raw_payload)
                    except ValidationError as exc:
                        logger.warning(
                            json.dumps(
                                {
                                    "event": "transport.invalid_voice_activity",
                                    "room_id": room_id,
                                    "error": str(exc),
                                },
                                sort_keys=True,
                            )
                        )
                        continue
                    if voice_activity.room_id == room_id:
                        await manager.broadcast_voice_activity(websocket, voice_activity)
                    continue

                try:
                    voice_chunk = IncomingVoiceChunkMessage.model_validate(raw_payload)
                except ValidationError as exc:
                    logger.warning(
                        json.dumps(
                            {
                                "event": "transport.invalid_voice_chunk",
                                "room_id": room_id,
                                "error": str(exc),
                            },
                            sort_keys=True,
                        )
                    )
                    continue

                if voice_chunk.room_id != room_id:
                    logger.warning(
                        json.dumps(
                            {
                                "event": "transport.room_mismatch",
                                "expected_room_id": room_id,
                                "payload_room_id": voice_chunk.room_id,
                            },
                            sort_keys=True,
                        )
                    )
                    continue

                asyncio.create_task(manager.process_voice_chunk(websocket, voice_chunk))
                continue

            if payload_type in SIGNALING_TYPES:
                try:
                    signal = IncomingSignalingMessage.model_validate(raw_payload)
                except ValidationError as exc:
                    logger.warning(
                        json.dumps(
                            {
                                "event": "transport.invalid_signaling",
                                "room_id": room_id,
                                "error": str(exc),
                            },
                            sort_keys=True,
                        )
                    )
                    continue

                if signal.room_id != room_id:
                    logger.warning(
                        json.dumps(
                            {
                                "event": "transport.room_mismatch",
                                "expected_room_id": room_id,
                                "payload_room_id": signal.room_id,
                            },
                            sort_keys=True,
                        )
                    )
                    continue

                await manager.relay_signaling(websocket, signal)
                continue

            try:
                payload = IncomingChatMessage.model_validate(raw_payload)
            except ValidationError as exc:
                logger.warning(
                    json.dumps(
                        {
                            "event": "transport.invalid_message",
                            "room_id": room_id,
                            "error": str(exc),
                        },
                        sort_keys=True,
                    )
                )
                continue

            if payload.room_id != room_id:
                logger.warning(
                    json.dumps(
                        {
                            "event": "transport.room_mismatch",
                            "expected_room_id": room_id,
                            "payload_room_id": payload.room_id,
                        },
                        sort_keys=True,
                    )
                )
                continue

            text = payload.text.strip()
            if not text:
                continue

            await manager.broadcast_chat(
                sender_socket=websocket,
                room_id=room_id,
                sender_name=authenticated_username,
                text=text,
                delivery_mode=payload.delivery_mode,
                target_session_id=payload.target_session_id,
            )

            # Fire-and-forget persistence — never blocks the broadcast
            asyncio.create_task(
                _persist_message(
                    room_id=room_id,
                    sender_name=authenticated_username,
                    text=text,
                    delivery_mode=payload.delivery_mode,
                    sender_id=user_id,
                )
            )

    except ValidationError:
        await websocket.close(code=1003, reason="Invalid message payload")
    except ValueError:
        await websocket.close(code=1003, reason="Invalid JSON payload")
    except WebSocketDisconnect as exc:
        logger.info(
            json.dumps(
                {
                    "event": "transport.websocket_disconnect",
                    "room_id": room_id,
                    "code": exc.code,
                    "reason": exc.reason,
                },
                sort_keys=True,
            )
        )
        if registered:
            reason = f"websocket_disconnect_{exc.code}"
            if exc.reason:
                reason = f"{reason}_{exc.reason}"
            await manager.disconnect(
                websocket,
                room_id,
                reason=reason,
            )
            registered = False
    finally:
        if registered:
            await manager.disconnect(websocket, room_id)


async def _persist_message(
    room_id: str,
    sender_name: str,
    text: str,
    delivery_mode: str,
    sender_id: Optional[str],
) -> None:
    try:
        db = get_db()
        repo = MessageRepository(db)
        await repo.save(
            room_id=room_id,
            sender_name=sender_name,
            original_text=text,
            source_language="unknown",
            delivery_mode=delivery_mode,
            sender_id=sender_id,
        )
    except Exception as exc:
        logger.warning(
            json.dumps({"event": "persistence.error", "error": str(exc)}, sort_keys=True)
        )


@router.get("/rooms/{room_id}/stats", response_model=RoomStats)
async def room_stats(
    room_id: str,
    _: dict = Depends(require_role("admin")),
) -> RoomStats:
    return await manager.room_stats(room_id)


@router.get("/rooms/stats", response_model=list[RoomStats])
async def all_room_stats(
    _: dict = Depends(require_role("admin")),
) -> list[RoomStats]:
    return await manager.all_room_stats()


@router.get("/rooms/{room_id}/messages")
async def room_messages(
    room_id: str,
    limit: int = 50,
    _: dict = Depends(get_current_user),
) -> list[dict]:
    db = get_db()
    repo = MessageRepository(db)
    messages = await repo.get_room_messages(room_id, limit=limit)
    return [
        {
            "id": str(m["_id"]),
            "room_id": m["room_id"],
            "sender_name": m["sender_name"],
            "original_text": m["original_text"],
            "source_language": m["source_language"],
            "delivery_mode": m["delivery_mode"],
            "timestamp": m["timestamp"].isoformat(),
        }
        for m in messages
    ]


@router.get("/admin/users")
async def admin_users(
    _: dict = Depends(require_role("admin")),
) -> dict:
    db = get_db()
    repo = UserRepository(db)
    users = await repo.list_users(limit=500)
    distributions = await repo.profile_distributions()
    return {
        **distributions,
        "users": [
            {
                "user_id": str(user["_id"]),
                "name": user.get("name") or user.get("username", ""),
                "username": user.get("username", ""),
                "email": user.get("email", ""),
                "role": user.get("role", "participant"),
                "preferred_language": user.get("preferred_language", "en"),
                "pronouns": user.get("pronouns"),
                "voice_preference": user.get("voice_preference", "auto"),
            }
            for user in users
        ],
    }
