import asyncio
import hashlib
import hmac
import json
import logging
import secrets
from datetime import datetime, timezone
from typing import Any

from redis.asyncio import Redis

from app.config import get_settings

logger = logging.getLogger(__name__)

COMMAND_CHANNEL = "translation_bot:admin:commands"
ACK_CHANNEL = "translation_bot:admin:acks"


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def canonical_payload(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sign_payload(payload: dict[str, Any]) -> str:
    secret = get_settings().CONTROL_PLANE_SECRET.encode("utf-8")
    return hmac.new(secret, canonical_payload(payload), hashlib.sha256).hexdigest()


class ControlPlanePublisher:
    def __init__(self) -> None:
        self.settings = get_settings()

    def _redis(self) -> Redis:
        return Redis.from_url(
            self.settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            socket_timeout=self.settings.CONTROL_PLANE_REDIS_TIMEOUT_SECONDS,
        )

    async def publish_and_wait(
        self,
        *,
        command_type: str,
        actor_id: str,
        actor_email: str,
        room_id: str | None = None,
        target_session_id: str | None = None,
        target_user_id: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        command_id = secrets.token_urlsafe(24)
        envelope = {
            "command_id": command_id,
            "command_type": command_type,
            "actor_id": actor_id,
            "actor_email": actor_email,
            "room_id": room_id,
            "target_session_id": target_session_id,
            "target_user_id": target_user_id,
            "payload": payload or {},
            "issued_at": utcnow_iso(),
        }
        envelope["signature"] = sign_payload(envelope)

        redis = self._redis()
        pubsub = redis.pubsub()
        try:
            await pubsub.subscribe(ACK_CHANNEL)
            await redis.publish(COMMAND_CHANNEL, json.dumps(envelope, ensure_ascii=False))
            return await self._wait_for_ack(pubsub, command_id)
        except Exception as exc:
            logger.warning(
                json.dumps(
                    {
                        "event": "control_plane.publish_failed",
                        "command_id": command_id,
                        "command_type": command_type,
                        "error": str(exc),
                    },
                    sort_keys=True,
                )
            )
            return {
                "command_id": command_id,
                "status": "FAILED",
                "message": f"Control plane unavailable: {exc}",
            }
        finally:
            await pubsub.close()
            await redis.aclose()

    async def _wait_for_ack(self, pubsub, command_id: str) -> dict[str, Any]:
        deadline = asyncio.get_running_loop().time() + self.settings.CONTROL_PLANE_ACK_TIMEOUT_SECONDS
        while asyncio.get_running_loop().time() < deadline:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=0.25)
            if not message or message.get("type") != "message":
                continue
            try:
                payload = json.loads(message["data"])
            except json.JSONDecodeError:
                continue
            if payload.get("command_id") == command_id:
                return payload
        return {
            "command_id": command_id,
            "status": "TIMEOUT",
            "message": "User backend did not acknowledge the command before timeout.",
        }


control_plane = ControlPlanePublisher()
