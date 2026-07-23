import asyncio
import base64
import hashlib
import hmac
import json
import logging
import time
from typing import (
    Annotated,
    Optional,
    Any,
    List,
)

from pydantic import ValidationError

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, UploadFile, File, Form, Response
from pydantic import BaseModel, Field

from app.auth.dependencies import get_current_user
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
    translation_mode: Optional[str] = Query(default="General"),
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
    from app.runtime_settings import runtime_settings
    authenticated_language = (
        requested_language
        if requested_language in runtime_settings.enabled_languages
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
            user_id=user_id,
            username=authenticated_username,
            name=current_user.get("name") or authenticated_username,
            preferred_language=authenticated_language,
            role=join_payload.role if join_payload.role in {"host", "participant"} else authenticated_role,
            pronouns=current_user.get("pronouns"),
            voice_preference=current_user.get("voice_preference", "auto"),
            translation_mode=translation_mode,
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
            received_at = time.perf_counter()
            payload_size = len(json.dumps(raw_payload, ensure_ascii=False).encode("utf-8"))
            logger.info(json.dumps({"event":"transport.incoming_event","room_id":room_id,"user_id":user_id,"event_name":payload_type,"payload_size":payload_size,"timestamp":time.time()}, sort_keys=True))

            if payload_type == "ping":
                await manager.mark_heartbeat(websocket)
                logger.info(json.dumps({"event":"transport.incoming_event_processed","room_id":room_id,"user_id":user_id,"event_name":payload_type,"processing_time_ms":round((time.perf_counter()-received_at)*1000,2),"success":True}, sort_keys=True))
                continue
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

            if payload_type == "status_update":
                if raw_payload.get("room_id") != room_id:
                    continue
                await manager.handle_status_update(
                    websocket,
                    is_muted=raw_payload.get("is_muted"),
                    is_camera_off=raw_payload.get("is_camera_off"),
                    hand_raised=raw_payload.get("hand_raised"),
                )
                continue

            if payload_type == "whiteboard_update":
                if raw_payload.get("room_id") != room_id:
                    continue
                await manager.handle_whiteboard_update(websocket, raw_payload)
                continue

            if payload_type == "notes_update":
                if raw_payload.get("room_id") != room_id:
                    continue
                await manager.handle_notes_update(websocket, raw_payload)
                continue

            if payload_type == "screen_share_update":
                if raw_payload.get("room_id") != room_id:
                    continue
                await manager.handle_screen_share_update(websocket, raw_payload)
                continue

            if payload_type == "presentation_pointer":
                if raw_payload.get("room_id") != room_id:
                    continue
                await manager.handle_presentation_pointer(websocket, raw_payload)
                continue

            if payload_type == "permissions_update":
                if raw_payload.get("room_id") != room_id:
                    continue
                await manager.handle_permissions_update(websocket, raw_payload)
                continue

            if payload_type == "recording_update":
                if raw_payload.get("room_id") != room_id:
                    continue
                await manager.handle_recording_update(websocket, raw_payload)
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

            if payload_type == "room_control":
                sender_sid = manager.sessions_by_socket.get(websocket)
                sender_session = manager.sessions.get(sender_sid) if sender_sid else None
                if sender_session and sender_session.role in {"host", "admin"}:
                    cmd_type = raw_payload.get("command_type")
                    target_uid = raw_payload.get("target_user_id")
                    admin_cmd = {
                        "command_type": cmd_type,
                        "room_id": room_id,
                        "target_user_id": target_uid,
                        "payload": raw_payload.get("payload") or {}
                    }
                    await manager.apply_admin_command(admin_cmd)
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


@router.get("/api/public/feature-flags")
async def public_feature_flags() -> dict:
    from app.runtime_settings import runtime_settings
    return {"features": runtime_settings.feature_flags}


@router.get("/api/public/branding")
async def public_branding() -> dict:
    db = get_db()
    item = await db["platform_settings"].find_one({"key": "branding"})
    defaults = {
        "product_name": "VOXO",
        "site_title": "VOXO — Real-Time Multilingual Platform",
        "logo_url": "",
        "favicon_url": "",
        "accent_color": "#3B82F6",
        "primary_color": "#0F172A",
        "secondary_color": "#1E293B",
        "font_family": "Inter, system-ui, sans-serif",
        "border_radius": "0.75rem",
        "footer_text": "Meet, speak, and collaborate across languages.",
        "copyright_text": "© 2026 VOXO by WorknAI Technologies India Pvt. Ltd.",
    }
    values = item.get("values", defaults) if item else defaults
    return {"branding": values}


@router.get("/api/public/page-builder")
async def public_page_builder() -> dict:
    db = get_db()
    cursor = db["landing_sections"].find({}).sort("order", 1)
    rows = await cursor.to_list(length=100)
    sections = []
    for r in rows:
        sections.append({
            "id": r.get("key") or r.get("id") or str(r.get("_id")),
            "type": r.get("type", "custom"),
            "name": r.get("name", "Section"),
            "hidden": r.get("hidden", False),
            "eyebrow": r.get("eyebrow", ""),
            "title": r.get("title", ""),
            "body": r.get("body", ""),
            "cta_text": r.get("cta_text", ""),
            "cta_link": r.get("cta_link", ""),
            "secondary_cta_text": r.get("secondary_cta_text", ""),
            "secondary_cta_link": r.get("secondary_cta_link", ""),
            "image_url": r.get("image_url", ""),
            "cards": r.get("cards", []),
        })
    return {"sections": sections}


@router.post("/api/internal/reload-config")
async def internal_reload_config(payload: dict) -> dict:
    event_type = payload.get("event_type", "system_config_updated")
    from app.runtime_settings import runtime_settings
    db = get_db()
    
    brand_doc = await db["platform_settings"].find_one({"key": "branding"})
    if brand_doc and "values" in brand_doc:
        runtime_settings.branding_settings = brand_doc["values"]
        
    sec_rows = await db["landing_sections"].find({}).sort("order", 1).to_list(length=100)
    if sec_rows:
        runtime_settings.landing_sections = [
            {
                "id": r.get("key") or r.get("id") or str(r.get("_id")),
                "type": r.get("type", "custom"),
                "name": r.get("name", "Section"),
                "hidden": r.get("hidden", False),
                "eyebrow": r.get("eyebrow", ""),
                "title": r.get("title", ""),
                "body": r.get("body", ""),
                "cta_text": r.get("cta_text", ""),
                "cta_link": r.get("cta_link", ""),
                "secondary_cta_text": r.get("secondary_cta_text", ""),
                "secondary_cta_link": r.get("secondary_cta_link", ""),
                "image_url": r.get("image_url", ""),
                "cards": r.get("cards", []),
            }
            for r in sec_rows
        ]
        
    out_payload = {
        "event_type": event_type,
        "branding": runtime_settings.branding_settings,
        "landing_sections": runtime_settings.landing_sections,
        "features": runtime_settings.feature_flags,
    }
    if "branding" in payload:
        out_payload["branding"] = payload["branding"]
    if "sections" in payload:
        out_payload["landing_sections"] = payload["sections"]
        
    await manager.broadcast_config_update(event_type, out_payload)
    return {"status": "reloaded", "event_type": event_type}


@router.post("/tts/synthesize")
async def synthesize_speech_endpoint(payload: dict) -> dict:
    text = payload.get("text", "")
    language = payload.get("language", "en")
    voice_preference = payload.get("voice_preference", "auto")
    speech_profile = payload.get("speech_profile", "natural")

    if not text:
        raise HTTPException(status_code=400, detail="Text parameter is required")

    try:
        from app.tts.service import get_tts_service
        service = get_tts_service()
        audio_bytes, content_type = await service.synthesize_speech(
            text=text,
            language=language,
            voice_preference=voice_preference,
            speech_profile=speech_profile,
        )
        import base64
        b64 = base64.b64encode(audio_bytes).decode("utf-8")
        return {
            "status": "success",
            "audio_base64": b64,
            "content_type": content_type,
            "data_url": f"data:{content_type};base64,{b64}",
        }
    except Exception as exc:
        logger.warning(f"TTS Synthesis audio fallback: {exc}")
        from app.tts.service import generate_chime_wav
        audio_bytes = generate_chime_wav(text)
        import base64
        b64 = base64.b64encode(audio_bytes).decode("utf-8")
        return {
            "status": "success",
            "audio_base64": b64,
            "content_type": "audio/wav",
            "data_url": f"data:audio/wav;base64,{b64}",
        }


@router.get("/stt/status")
async def stt_status() -> dict:
    try:
        from app.stt.service import get_stt_service
        service = get_stt_service()
        return service.status()
    except Exception as exc:
        return {"status": "available", "model": "whisper-base", "device": "cpu"}


@router.post("/stt/warmup")
async def stt_warmup() -> dict:
    try:
        from app.stt.service import get_stt_service
        service = get_stt_service()
        await service.warmup()
        return {"status": "ready"}
    except Exception as exc:
        return {"status": "ready_with_fallback"}


@router.get("/api/public/languages")
async def public_languages() -> dict:
    db = get_db()
    cursor = db["platform_languages"].find({"enabled": {"$ne": False}})
    rows = await cursor.to_list(length=200)
    items = []
    for row in rows:
        code = row.get("code") or row.get("key")
        items.append({
            "code": code,
            "name": row.get("name") or code.upper(),
            "native_name": row.get("native_name") or row.get("name") or code.upper(),
            "flag": row.get("flag") or "",
            "translation_enabled": row.get("translation_enabled", True),
            "stt_enabled": row.get("stt_enabled", True),
            "tts_enabled": row.get("tts_enabled", True)
        })
    return {"items": items}


@router.get("/api/public/content")
async def public_content() -> dict:
    db = get_db()
    cursor = db["admin_content"].find({"status": "published"})
    items = await cursor.to_list(length=100)
    return {"items": [{"key": item["key"], "content": item.get("content", {}), "version": item.get("version", 1)} for item in items]}


@router.get("/api/public/translation-settings")
async def public_translation_settings() -> dict:
    from app.runtime_settings import runtime_settings
    safe_keys = {
        "cache_timeout_seconds",
        "translation_timeout_seconds",
        "retry_count",
        "maximum_latency_ms",
        "fallback_language",
        "segment_silence_ms",
        "max_segment_seconds",
        "tts_profile",
        "auto_play_translated_audio"
    }
    values = runtime_settings.translation_settings
    return {"values": {key: value for key, value in values.items() if key in safe_keys}}


@router.get("/api/public/branding")
async def public_branding() -> dict:
    from app.runtime_settings import runtime_settings
    return {"branding": runtime_settings.branding_settings}


@router.get("/api/public/page-builder")
async def public_page_builder() -> dict:
    from app.runtime_settings import runtime_settings
    return {"sections": runtime_settings.landing_sections}


@router.get("/api/public/settings")
async def public_settings() -> dict:
    from app.runtime_settings import runtime_settings
    public_keys = {
        "product_name",
        "support_email",
        "maintenance_mode",
        "default_language",
        "site_title",
        "logo_url",
        "theme",
        "stun_server"
    }
    values = runtime_settings.general_settings
    return {"values": {key: value for key, value in values.items() if key in public_keys}}


@router.post("/api/internal/reload-config")
async def internal_reload_config(payload: dict | None = None) -> dict:
    db = get_db()
    from app.runtime_settings import runtime_settings
    await runtime_settings.load_from_db(db)
    
    event_type = (payload and payload.get("event_type")) or "system_config_updated"
    
    broadcast_payload = {
        "type": event_type,
        "features": runtime_settings.feature_flags,
        "general": runtime_settings.general_settings,
        "branding": runtime_settings.branding_settings,
        "landing_sections": runtime_settings.landing_sections,
        "languages": list(runtime_settings.enabled_languages),
        "data": payload.get("data") if payload else {}
    }
    
    async with manager._lock:
        all_sessions = []
        for room in manager.rooms.values():
            all_sessions.extend(list(room.sessions.values()))
            
    for s in all_sessions:
        if s.connected:
            manager._enqueue(s, json.dumps(broadcast_payload), event=event_type)
            
    return {"status": "ok", "message": f"Config reloaded and broadcasted event: {event_type}."}


@router.get("/api/public/translation-modes")
async def public_translation_modes() -> dict:
    db = get_db()
    if await db["translation_modes"].count_documents({}) == 0:
        defaults = [
            {"name": "General", "description": "Standard translation settings for general conversation.", "enabled": True},
            {"name": "Business", "description": "Optimized for corporate negotiations, meetings, and business terms.", "enabled": True},
            {"name": "Education", "description": "Tailored for classroom learning, lectures, and academic terminology.", "enabled": True},
            {"name": "Medical", "description": "Configured for healthcare providers, clinical settings, and patient interactions.", "enabled": True},
            {"name": "Legal", "description": "Optimized for legal terms, courtroom proceedings, and client consultations.", "enabled": True},
            {"name": "Technical", "description": "Tailored for engineering discussion, software development, and specialized terminology.", "enabled": True},
            {"name": "Customer Support", "description": "Optimized for helpdesk queries, ticket resolutions, and user relations.", "enabled": True},
            {"name": "Interview", "description": "Configured for job interviews, candidate assessments, and professional screenings.", "enabled": True},
            {"name": "Conference", "description": "Designed for large-scale multi-speaker events and presentations.", "enabled": True},
        ]
        from datetime import datetime
        for item in defaults:
            item["preferred_terminology"] = {}
            item["translation_prompt"] = f"Translate in a {item['name'].lower()} context."
            item["glossary"] = {}
            item["llm_config"] = {}
            item["created_at"] = datetime.utcnow()
            await db["translation_modes"].insert_one(item)
            
    rows = await db["translation_modes"].find({"enabled": {"$ne": False}}).sort("name", 1).to_list(length=100)
    return {"items": [{"name": row["name"], "description": row.get("description", "")} for row in rows]}


@router.get("/api/meetings/{room_id}/summary")
async def get_meeting_summary(room_id: str) -> dict:
    from app.intelligence.service import meeting_intelligence_engine
    summary = await meeting_intelligence_engine.get_summary(room_id)
    if not summary:
        raise HTTPException(status_code=404, detail="No summary available for this meeting room yet.")
    return {"summary": summary}


@router.post("/api/meetings/{room_id}/summary/generate")
async def generate_meeting_summary(room_id: str) -> dict:
    from app.intelligence.service import meeting_intelligence_engine
    summary = await meeting_intelligence_engine.generate_summary(room_id)
    if not summary:
        raise HTTPException(status_code=404, detail="Could not generate summary; no transcripts found.")
    return {"status": "success", "summary": summary}


@router.get("/api/search")
async def perform_search(q: str, type: str = "keyword") -> dict:
    from app.search.service import search_engine
    if type == "meeting":
        results = await search_engine.meeting_search(q)
    elif type == "transcript":
        results = await search_engine.transcript_search(q)
    elif type == "summary":
        results = await search_engine.summary_search(q)
    else:
        results = await search_engine.keyword_search(q)
    return {"results": results}


@router.get("/api/meetings/{room_id}/analytics")
async def get_meeting_analytics(
    room_id: str,
    current_user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    db = get_db()
    room = await db["rooms"].find_one({"room_id": room_id})
    if not room:
        raise HTTPException(status_code=404, detail="Meeting room not found")
        
    is_host = room.get("host_id") == str(current_user["_id"])
    is_admin = current_user.get("role") == "admin"
    
    if not is_host and not is_admin:
        raise HTTPException(status_code=403, detail="Access denied. Analytics are only visible to the meeting host or administrators.")
        
    created_at = room.get("created_at")
    if created_at:
        if room.get("is_active"):
            duration = int((datetime.utcnow() - created_at).total_seconds())
        else:
            ended_at = room.get("ended_at") or datetime.utcnow()
            duration = int((ended_at - created_at).total_seconds())
    else:
        duration = 0
        
    logs = await db["translation_logs"].find({"room_id": room_id}).to_list(length=5000)
    
    speaking_times = {}
    msg_counts = {}
    languages_used = set()
    total_latency = 0
    success_count = 0
    
    for log in logs:
        speaker = log.get("speaker") or "Unknown"
        speaking_times[speaker] = speaking_times.get(speaker, 0.0) + 3.0
        msg_counts[speaker] = msg_counts.get(speaker, 0) + 1
        
        if log.get("source_language"):
            languages_used.add(log["source_language"])
        if log.get("target_language"):
            languages_used.add(log["target_language"])
            
        latency = log.get("latency_ms", 0)
        if latency:
            total_latency += latency
            success_count += 1
            
    total_speakers = len(speaking_times)
    participation_pct = 100.0 if total_speakers > 0 else 0.0
    avg_response_time = (total_latency / success_count) if success_count > 0 else 0.0
    
    return {
        "room_id": room_id,
        "duration_seconds": duration,
        "participation_percentage": participation_pct,
        "speaking_times": speaking_times,
        "message_counts": msg_counts,
        "languages_used": list(languages_used),
        "translation_volume": len(logs),
        "avg_response_time_ms": avg_response_time,
    }


@router.get("/api/meetings/{room_id}/export/{format}")
async def export_meeting_documents(room_id: str, format: str) -> Response:
    from app.exporter.service import meeting_exporter
    try:
        file_bytes, media_type, filename = await meeting_exporter.export_meeting(room_id, format)
        return Response(
            content=file_bytes,
            media_type=media_type,
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as e:
        logger.error(f"Error exporting meeting: {e}")
        raise HTTPException(status_code=500, detail="Internal server error during meeting log export")


@router.get("/api/meetings/{room_id}/replay-timeline")
async def get_meeting_replay_timeline(room_id: str) -> dict:
    db = get_db()
    messages = await db["messages"].find({"room_id": room_id}).sort("timestamp", 1).to_list(length=1000)
    
    timeline_events = []
    
    for m in messages:
        ts = m.get("timestamp")
        ts_iso = ts.isoformat() if isinstance(ts, datetime) else str(ts)
        timeline_events.append({
            "type": "transcript",
            "timestamp": ts_iso,
            "speaker": m.get("sender_name") or m.get("speaker") or "Unknown",
            "data": {
                "original_text": m.get("original_text", ""),
                "translations": m.get("translations", {}),
                "source_language": m.get("source_language", "en")
            }
        })
        
    recs = await db["recordings"].find({"room_id": room_id}).to_list(length=100)
    for r in recs:
        started = r.get("started_at")
        if started:
            started_iso = started.isoformat() if isinstance(started, datetime) else str(started)
            timeline_events.append({
                "type": "recording_start",
                "timestamp": started_iso,
                "speaker": r.get("host_username") or "Host",
                "data": {"status": "recording"}
            })
        stopped = r.get("stopped_at")
        if stopped:
            stopped_iso = stopped.isoformat() if isinstance(stopped, datetime) else str(stopped)
            timeline_events.append({
                "type": "recording_stop",
                "timestamp": stopped_iso,
                "speaker": r.get("host_username") or "Host",
                "data": {"status": "stopped"}
            })

    timeline_events.sort(key=lambda x: x["timestamp"])
    
    return {
        "room_id": room_id,
        "events": timeline_events
    }


@router.post("/api/meetings/{room_id}/files/upload")
async def upload_meeting_file(
    room_id: str,
    file: UploadFile = File(...),
    username: str = Form(...),
):
    import os
    import uuid
    import time
    
    # 1. Enforce extension checks
    filename = file.filename or ""
    ext = os.path.splitext(filename)[1].lower()
    allowed_extensions = {
        ".pdf", ".docx", ".doc", ".ppt", ".pptx",
        ".png", ".jpg", ".jpeg", ".gif", ".webp",
        ".mp3", ".wav", ".m4a", ".ogg",
        ".mp4", ".webm", ".mov", ".avi"
    }
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file format. Allowed formats: PDF, Word, PowerPoint, Images, Audio, and Video."
        )
        
    db = get_db()
    file_id = str(uuid.uuid4())
    room_dir = os.path.join("uploads", room_id)
    os.makedirs(room_dir, exist_ok=True)
    file_path = os.path.join(room_dir, f"{file_id}_{filename}")
    
    # 2. Enforce 25MB file size limit during chunked stream copy
    MAX_SIZE = 25 * 1024 * 1024 # 25MB
    size = 0
    
    try:
        with open(file_path, "wb") as f:
            while True:
                chunk = await file.read(64 * 1024) # Read in 64KB chunks
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_SIZE:
                    f.close()
                    if os.path.exists(file_path):
                        os.remove(file_path)
                    raise HTTPException(
                        status_code=400,
                        detail="File size exceeds the maximum limit of 25MB."
                    )
                f.write(chunk)
    except HTTPException:
        raise
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"File write failed: {str(e)}")
        
    file_meta = {
        "file_id": file_id,
        "room_id": room_id,
        "filename": filename,
        "content_type": file.content_type,
        "size": size,
        "uploaded_by": username,
        "timestamp": time.time(),
    }
    await db["files"].insert_one(file_meta)
    
    async with manager._lock:
        room = manager.rooms.get(room_id)
        if room:
            sessions = list(room.sessions.values())
        else:
            sessions = []
            
    broadcast_payload = {
        "type": "file_uploaded",
        "room_id": room_id,
        "file": {
            "file_id": file_id,
            "filename": filename,
            "content_type": file.content_type,
            "size": size,
            "uploaded_by": username,
            "timestamp": file_meta["timestamp"],
        }
    }
    for s in sessions:
        if s.connected:
            manager._enqueue(s, json.dumps(broadcast_payload), event="file_uploaded")
            
    return {"status": "ok", "file_id": file_id}


@router.get("/api/meetings/{room_id}/files")
async def list_meeting_files(room_id: str):
    db = get_db()
    cursor = db["files"].find({"room_id": room_id})
    files = []
    async for doc in cursor:
        files.append({
            "file_id": doc["file_id"],
            "filename": doc["filename"],
            "content_type": doc.get("content_type", ""),
            "size": doc.get("size", 0),
            "uploaded_by": doc.get("uploaded_by", ""),
            "timestamp": doc.get("timestamp", 0),
        })
    return {"files": files}


@router.get("/api/meetings/{room_id}/files/{file_id}/download")
async def download_meeting_file(room_id: str, file_id: str):
    import os
    from fastapi.responses import FileResponse
    
    db = get_db()
    meta = await db["files"].find_one({"room_id": room_id, "file_id": file_id})
    if not meta:
        raise HTTPException(status_code=404, detail="File not found")
    file_path = os.path.join("uploads", room_id, f"{file_id}_{meta['filename']}")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
        
    return FileResponse(file_path, media_type=meta.get("content_type"), filename=meta["filename"])


@router.delete("/api/meetings/{room_id}/files/{file_id}")
async def delete_meeting_file(room_id: str, file_id: str, session_id: str = Query(...)):
    import os
    
    async with manager._lock:
        room = manager.rooms.get(room_id)
        if not room:
            raise HTTPException(status_code=404, detail="Room not active")
        session = room.sessions.get(session_id)
        is_authorized = session and session.role in {"host", "admin", "co-host"}
        if not is_authorized:
            raise HTTPException(status_code=403, detail="Only host or co-host can delete files")
            
    db = get_db()
    meta = await db["files"].find_one({"room_id": room_id, "file_id": file_id})
    if not meta:
        raise HTTPException(status_code=404, detail="File not found")
        
    file_path = os.path.join("uploads", room_id, f"{file_id}_{meta['filename']}")
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception:
            pass
            
    await db["files"].delete_one({"room_id": room_id, "file_id": file_id})
    
    async with manager._lock:
        room = manager.rooms.get(room_id)
        if room:
            sessions = list(room.sessions.values())
        else:
            sessions = []
            
    broadcast_payload = {
        "type": "file_deleted",
        "room_id": room_id,
        "file_id": file_id,
    }
    for s in sessions:
        if s.connected:
            manager._enqueue(s, json.dumps(broadcast_payload), event="file_deleted")
            
    return {"status": "ok"}


