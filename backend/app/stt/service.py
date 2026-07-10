import asyncio
import json
import logging
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from time import perf_counter
from typing import Protocol


logger = logging.getLogger(__name__)

STT_PROVIDER = os.getenv("STT_PROVIDER", "faster_whisper")
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
WHISPER_BEAM_SIZE = int(os.getenv("WHISPER_BEAM_SIZE", "5"))
WHISPER_VAD_MIN_SILENCE_MS = int(os.getenv("WHISPER_VAD_MIN_SILENCE_MS", "700"))
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")


@dataclass(frozen=True)
class STTResult:
    text: str
    language: str | None
    provider: str
    latency_ms: int
    duration_seconds: float = 0.0


class STTProvider(Protocol):
    name: str

    async def transcribe(self, audio_bytes: bytes, mime_type: str) -> STTResult:
        ...


class STTUnavailableError(RuntimeError):
    pass


class FasterWhisperProvider:
    name = "faster_whisper"

    def __init__(self) -> None:
        self._model = None
        self._load_latency_ms: int | None = None

    def _load_model(self):
        if self._model is not None:
            return self._model

        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise STTUnavailableError(
                "faster-whisper is not installed. Install backend requirements and ensure model access."
            ) from exc

        from app.runtime_settings import runtime_settings
        model_name = runtime_settings.translation_settings.get("stt_model", WHISPER_MODEL)

        started = perf_counter()
        self._model = WhisperModel(
            model_name,
            device=WHISPER_DEVICE,
            compute_type=WHISPER_COMPUTE_TYPE,
        )
        self._load_latency_ms = int((perf_counter() - started) * 1000)
        logger.info(
            json.dumps(
                {
                    "event": "stt.model_loaded",
                    "provider": self.name,
                    "model": model_name,
                    "device": WHISPER_DEVICE,
                    "compute_type": WHISPER_COMPUTE_TYPE,
                    "beam_size": int(runtime_settings.translation_settings.get("beam_size", WHISPER_BEAM_SIZE)),
                    "vad_min_silence_ms": int(runtime_settings.translation_settings.get("segment_silence_ms", WHISPER_VAD_MIN_SILENCE_MS)),
                    "latency_ms": self._load_latency_ms,
                },
                sort_keys=True,
            )
        )
        return self._model

    @property
    def ready(self) -> bool:
        return self._model is not None

    @property
    def load_latency_ms(self) -> int | None:
        return self._load_latency_ms

    async def transcribe(self, audio_bytes: bytes, mime_type: str) -> STTResult:
        started = perf_counter()
        suffix = _suffix_for_mime_type(mime_type)

        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as audio_file:
            audio_file.write(audio_bytes)
            audio_path = Path(audio_file.name)

        try:
            text, language, duration_seconds = await asyncio.to_thread(self._transcribe_file, audio_path)
        finally:
            audio_path.unlink(missing_ok=True)

        latency_ms = int((perf_counter() - started) * 1000)
        return STTResult(
            text=text,
            language=language,
            provider=self.name,
            latency_ms=latency_ms,
            duration_seconds=duration_seconds,
        )

    def _transcribe_file(self, audio_path: Path) -> tuple[str, str | None, float]:
        model = self._load_model()
        from app.runtime_settings import runtime_settings
        vad_silence = int(runtime_settings.translation_settings.get("segment_silence_ms", WHISPER_VAD_MIN_SILENCE_MS))
        beam_size = int(runtime_settings.translation_settings.get("beam_size", WHISPER_BEAM_SIZE))

        segments, info = model.transcribe(
            str(audio_path),
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": vad_silence},
            beam_size=beam_size,
        )
        text = " ".join(segment.text.strip() for segment in segments).strip()
        language = getattr(info, "language", None)
        duration_seconds = getattr(info, "duration", 0.0)
        return text, language, duration_seconds


class STTService:
    def __init__(self, provider: STTProvider | None = None) -> None:
        self.provider = provider or FasterWhisperProvider()
        self._warmup_lock = asyncio.Lock()

    def status(self) -> dict:
        from app.runtime_settings import runtime_settings
        model_name = runtime_settings.translation_settings.get("stt_model", WHISPER_MODEL)
        return {
            "provider": getattr(self.provider, "name", STT_PROVIDER),
            "model": model_name,
            "device": WHISPER_DEVICE,
            "compute_type": WHISPER_COMPUTE_TYPE,
            "beam_size": int(runtime_settings.translation_settings.get("beam_size", WHISPER_BEAM_SIZE)),
            "vad_min_silence_ms": int(runtime_settings.translation_settings.get("segment_silence_ms", WHISPER_VAD_MIN_SILENCE_MS)),
            "ready": bool(getattr(self.provider, "ready", False)),
            "load_latency_ms": getattr(self.provider, "load_latency_ms", None),
        }

    async def warmup(self) -> dict:
        async with self._warmup_lock:
            started = perf_counter()
            try:
                load_model = getattr(self.provider, "_load_model")
                await asyncio.to_thread(load_model)
            except Exception as exc:
                logger.warning(
                    json.dumps(
                        {
                            "event": "stt.warmup_failure",
                            "provider": getattr(self.provider, "name", STT_PROVIDER),
                            "model": WHISPER_MODEL,
                            "error": str(exc),
                        },
                        sort_keys=True,
                    )
                )
                raise

            payload = self.status()
            payload["warmup_latency_ms"] = int((perf_counter() - started) * 1000)
            logger.info(
                json.dumps(
                    {"event": "stt.warmup_success", **payload},
                    sort_keys=True,
                )
            )
            return payload

    async def update_model(self, new_model_name: str) -> None:
        if hasattr(self.provider, "_model"):
            self.provider._model = None
            logger.info(f"Cleared Whisper STT model cache for reloading to: {new_model_name}")
            await self.warmup()

    async def transcribe(self, audio_bytes: bytes, mime_type: str) -> STTResult:
        try:
            result = await self.provider.transcribe(audio_bytes, mime_type)
        except Exception as exc:
            logger.warning(
                json.dumps(
                    {
                        "event": "stt.failure",
                        "provider": getattr(self.provider, "name", STT_PROVIDER),
                        "error": str(exc),
                    },
                    sort_keys=True,
                )
            )
            raise

        logger.info(
            json.dumps(
                {
                    "event": "stt.success",
                    "provider": result.provider,
                    "language": result.language,
                    "latency_ms": result.latency_ms,
                    "text_length": len(result.text),
                },
                ensure_ascii=False,
                sort_keys=True,
            )
        )
        return result


def _suffix_for_mime_type(mime_type: str) -> str:
    if "mp4" in mime_type:
        return ".mp4"
    if "ogg" in mime_type:
        return ".ogg"
    if "wav" in mime_type:
        return ".wav"
    return ".webm"


stt_service = STTService()
