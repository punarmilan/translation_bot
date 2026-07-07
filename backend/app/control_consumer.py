import asyncio
import hashlib
import hmac
import json
import logging
from typing import Any

from redis.asyncio import Redis

from app.config import get_settings

logger = logging.getLogger(__name__)

COMMAND_CHANNEL = "translation_bot:admin:commands"
ACK_CHANNEL = "translation_bot:admin:acks"


def canonical_payload(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def is_valid_signature(envelope: dict[str, Any]) -> bool:
    signature = envelope.get("signature")
    if not isinstance(signature, str):
        return False
    unsigned = {key: value for key, value in envelope.items() if key != "signature"}
    secret = get_settings().CONTROL_PLANE_SECRET.encode("utf-8")
    expected = hmac.new(secret, canonical_payload(unsigned), hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)


class ControlConsumer:
    def __init__(self, manager) -> None:
        self.manager = manager
        self.settings = get_settings()
        self._task: asyncio.Task | None = None
        self._running = False

    def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._running = True
        self._task = asyncio.create_task(self._run(), name="admin-control-consumer")

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    def _redis(self) -> Redis:
        return Redis.from_url(
            self.settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            socket_timeout=self.settings.CONTROL_PLANE_REDIS_TIMEOUT_SECONDS,
        )

    async def _run(self) -> None:
        while self._running:
            redis = self._redis()
            pubsub = redis.pubsub()
            try:
                await pubsub.subscribe(COMMAND_CHANNEL)
                logger.info(json.dumps({"event": "control_plane.consumer_started", "channel": COMMAND_CHANNEL}))
                while self._running:
                    message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=0.5)
                    if not message or message.get("type") != "message":
                        continue
                    await self._handle_message(redis, message["data"])
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning(json.dumps({"event": "control_plane.consumer_error", "error": str(exc)}, sort_keys=True))
                await asyncio.sleep(2.0)
            finally:
                await pubsub.close()
                await redis.aclose()

    async def _handle_message(self, redis: Redis, raw: str) -> None:
        try:
            command = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning(json.dumps({"event": "control_plane.invalid_json"}))
            return

        if not is_valid_signature(command):
            logger.warning(
                json.dumps(
                    {
                        "event": "control_plane.rejected_signature",
                        "command_id": command.get("command_id"),
                        "command_type": command.get("command_type"),
                    },
                    sort_keys=True,
                )
            )
            return

        ack = await self.manager.apply_admin_command(command)
        await redis.publish(ACK_CHANNEL, json.dumps(ack, ensure_ascii=False))
        logger.info(json.dumps({"event": "control_plane.ack_published", **ack}, ensure_ascii=False, sort_keys=True))
