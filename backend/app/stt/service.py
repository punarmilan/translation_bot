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


@dataclass(frozen=True)
class STTResult:
    text: str
    language: str | None
    provider: str
    latency_ms: int


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

    def _load_model(self):
        if self._model is not None:
            return self._model

        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise STTUnavailableError(
                "faster-whisper is not installed. Install backend requirements and ensure model access."
            ) from exc

        self._model = WhisperModel(
            WHISPER_MODEL,
            device=WHISPER_DEVICE,
            compute_type=WHISPER_COMPUTE_TYPE,
        )
        return self._model

    async def transcribe(self, audio_bytes: bytes, mime_type: str) -> STTResult:
        started = perf_counter()
        suffix = _suffix_for_mime_type(mime_type)

        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as audio_file:
            audio_file.write(audio_bytes)
            audio_path = Path(audio_file.name)

        try:
            text, language = await asyncio.to_thread(self._transcribe_file, audio_path)
        finally:
            audio_path.unlink(missing_ok=True)

        latency_ms = int((perf_counter() - started) * 1000)
        return STTResult(
            text=text,
            language=language,
            provider=self.name,
            latency_ms=latency_ms,
        )

    def _transcribe_file(self, audio_path: Path) -> tuple[str, str | None]:
        model = self._load_model()
        segments, info = model.transcribe(str(audio_path), vad_filter=True, beam_size=1)
        text = " ".join(segment.text.strip() for segment in segments).strip()
        language = getattr(info, "language", None)
        return text, language


class STTService:
    def __init__(self, provider: STTProvider | None = None) -> None:
        self.provider = provider or FasterWhisperProvider()

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
