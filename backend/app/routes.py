import asyncio
import json
import logging
from typing import Optional

from pydantic import ValidationError

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect

from app.auth.dependencies import get_current_user, require_role
from app.auth.service import decode_token
from app.database import get_db
from app.repositories.message_repository import MessageRepository
from app.repositories.user_repository import UserRepository
from app.schemas import IncomingChatMessage, IncomingSignalingMessage, JoinMessage, RoomStats
from app.translation.service import SUPPORTED_LANGUAGES, normalize_language
from app.websocket_manager import RoomConnectionManager


router = APIRouter()
manager = RoomConnectionManager()
logger = logging.getLogger(__name__)
SIGNALING_TYPES = {
    "webrtc_offer",
    "webrtc_answer",
    "webrtc_ice_candidate",
    "call_request",
    "call_accept",
    "call_reject",
    "call_end",
}


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
            preferred_language=authenticated_language,
            role=authenticated_role,
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
    except WebSocketDisconnect:
        pass
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
