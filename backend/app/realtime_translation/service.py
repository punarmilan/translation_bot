import asyncio
import base64
import json
import logging
from dataclasses import dataclass
from time import perf_counter

from app.schemas import ListenerMode
from app.tts.service import TTSResult, tts_service
from app.translation.service import normalize_language


logger = logging.getLogger(__name__)

TRANSCRIPT_LISTENER_MODES: set[ListenerMode] = {
    "original_transcript",
    "original_translated_audio",
}
AUDIO_LISTENER_MODES: set[ListenerMode] = {
    "translated_audio_only",
    "original_translated_audio",
}


@dataclass(frozen=True)
class SynthesizedTranslationAudio:
    audio_base64: str
    mime_type: str
    provider: str
    tts_latency_ms: int
    synthesis_total_ms: int
    selected_model: str


class RealtimeTranslationService:
    """Coordinates translated audio generation for live meeting listeners."""

    def __init__(self) -> None:
        self._synthesis_locks: dict[tuple[str, str], asyncio.Lock] = {}

    def should_send_transcript(self, listener_mode: ListenerMode) -> bool:
        return listener_mode in TRANSCRIPT_LISTENER_MODES

    def should_send_translated_audio(self, listener_mode: ListenerMode) -> bool:
        return listener_mode in AUDIO_LISTENER_MODES

    def release_session(self, session_id: str) -> None:
        stale_keys = [
            key for key in self._synthesis_locks if key[0] == session_id
        ]
        for key in stale_keys:
            self._synthesis_locks.pop(key, None)

    async def synthesize_audio(
        self,
        text: str,
        target_language: str,
        *,
        source_language: str,
        sequence: int,
        sender_session_id: str,
        speaker_voice_preference: str | None = "auto",
    ) -> SynthesizedTranslationAudio:
        started = perf_counter()
        normalized_target = normalize_language(target_language)
        lock_key = (sender_session_id, normalized_target)
        synthesis_lock = self._synthesis_locks.setdefault(lock_key, asyncio.Lock())
        async with synthesis_lock:
            result: TTSResult = await tts_service.synthesize(
                text=text,
                language=normalized_target,
                voice_preference=speaker_voice_preference or "auto",
            )
        synthesis_total_ms = int((perf_counter() - started) * 1000)
        payload = SynthesizedTranslationAudio(
            audio_base64=base64.b64encode(result.audio_bytes).decode("ascii"),
            mime_type=result.mime_type,
            provider=result.provider,
            tts_latency_ms=result.latency_ms,
            synthesis_total_ms=synthesis_total_ms,
            selected_model=result.selected_model,
        )
        logger.info(
            json.dumps(
                {
                    "event": "realtime_translation.audio_synthesized",
                    "sender_session_id": sender_session_id,
                    "sequence": sequence,
                    "source_language": source_language,
                    "target_language": normalized_target,
                    "speaker_voice_preference": speaker_voice_preference,
                    "tts_latency_ms": result.latency_ms,
                    "synthesis_total_ms": synthesis_total_ms,
                    "audio_bytes_base64": len(payload.audio_base64),
                },
                ensure_ascii=False,
                sort_keys=True,
            )
        )
        return payload


realtime_translation_service = RealtimeTranslationService()
