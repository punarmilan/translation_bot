import asyncio
import json
import logging
import os
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from time import perf_counter
from typing import Protocol

from app.tts.voices import (
    PIPER_LANGUAGE_NAMES,
    PIPER_VOICE_FILES,
    local_config_path,
    local_model_path,
)
from app.tts.voice_router import resolve_voice_route


logger = logging.getLogger(__name__)

TTS_PROVIDER = os.getenv("TTS_PROVIDER", "piper")
PIPER_EXECUTABLE = os.getenv("PIPER_EXECUTABLE", "piper")
PIPER_LENGTH_SCALE = os.getenv("PIPER_LENGTH_SCALE", "")
PIPER_SENTENCE_SILENCE = os.getenv("PIPER_SENTENCE_SILENCE", "")
PIPER_TIMEOUT_SECONDS = float(os.getenv("PIPER_TIMEOUT_SECONDS", "30"))
PIPER_SUPPORTED_LANGUAGES = tuple(PIPER_VOICE_FILES)

SPEECH_PROFILES = {
    "standard": {
        "length_scale": os.getenv("PIPER_STANDARD_LENGTH_SCALE", "1.0"),
        "sentence_silence": os.getenv("PIPER_STANDARD_SENTENCE_SILENCE", "0.25"),
        "noise_scale": os.getenv("PIPER_STANDARD_NOISE_SCALE", ""),
        "noise_w": os.getenv("PIPER_STANDARD_NOISE_W", ""),
    },
    "natural": {
        "length_scale": os.getenv("PIPER_NATURAL_LENGTH_SCALE", "1.08"),
        "sentence_silence": os.getenv("PIPER_NATURAL_SENTENCE_SILENCE", "0.35"),
        "noise_scale": os.getenv("PIPER_NATURAL_NOISE_SCALE", "0.667"),
        "noise_w": os.getenv("PIPER_NATURAL_NOISE_W", "0.8"),
    },
    "expressive": {
        "length_scale": os.getenv("PIPER_EXPRESSIVE_LENGTH_SCALE", "1.15"),
        "sentence_silence": os.getenv("PIPER_EXPRESSIVE_SENTENCE_SILENCE", "0.45"),
        "noise_scale": os.getenv("PIPER_EXPRESSIVE_NOISE_SCALE", "0.75"),
        "noise_w": os.getenv("PIPER_EXPRESSIVE_NOISE_W", "0.9"),
    },
}


def _env_key(prefix: str, language: str) -> str:
    return f"{prefix}_{language.upper().replace('-', '_')}"


def _voice_model_for(language: str | None, voice_preference: str | None = "auto") -> str:
    route = resolve_voice_route(language, voice_preference)
    routed_path = str(route.model_path)
    route_env_key = _env_key(
        f"PIPER_VOICE_MODEL_{route.requested_preference.upper()}",
        route.resolved_language,
    )
    routed_env = os.getenv(route_env_key)
    if routed_env:
        return routed_env
    normalized = (language or "en").lower().split("-")[0]
    default_path = str(local_model_path(normalized)) if normalized in PIPER_VOICE_FILES else ""
    return os.getenv(
        _env_key("PIPER_VOICE_MODEL", normalized),
        routed_path or default_path or os.getenv("PIPER_VOICE_MODEL", ""),
    )


def _voice_config_for(language: str | None, voice_preference: str | None = "auto") -> str:
    route = resolve_voice_route(language, voice_preference)
    routed_path = str(route.config_path)
    route_env_key = _env_key(
        f"PIPER_VOICE_CONFIG_{route.requested_preference.upper()}",
        route.resolved_language,
    )
    routed_env = os.getenv(route_env_key)
    if routed_env:
        return routed_env
    normalized = (language or "en").lower().split("-")[0]
    default_path = str(local_config_path(normalized)) if normalized in PIPER_VOICE_FILES else ""
    return os.getenv(
        _env_key("PIPER_VOICE_CONFIG", normalized),
        routed_path or default_path or os.getenv("PIPER_VOICE_CONFIG", ""),
    )


def prepare_tts_text(text: str) -> str:
    cleaned = " ".join(text.strip().split())
    if not cleaned:
        return cleaned
    cleaned = cleaned.replace(" - ", ", ")
    if cleaned[-1] not in ".?!":
        cleaned = f"{cleaned}."
    return cleaned


@dataclass(frozen=True)
class TTSResult:
    audio_bytes: bytes
    mime_type: str
    provider: str
    latency_ms: int
    requested_voice: str
    selected_voice: str
    selected_model: str
    selected_config: str | None
    output_file: str
    speech_profile: str
    fallback_used: bool


class TTSProvider(Protocol):
    name: str

    async def synthesize(
        self,
        text: str,
        language: str | None = None,
        voice_preference: str | None = "auto",
        speech_profile: str = "natural",
    ) -> TTSResult:
        ...

    def status(self) -> dict:
        ...


class TTSUnavailableError(RuntimeError):
    pass


class PiperProvider:
    name = "piper"

    def status(self) -> dict:
        voices = {}
        for language in PIPER_SUPPORTED_LANGUAGES:
            model = _voice_model_for(language)
            config = _voice_config_for(language)
            model_path = Path(model) if model else None
            config_path = Path(config) if config else None
            voices[language] = {
                "voice_model": model or None,
                "voice_config": config or None,
                "ready": bool(model_path and model_path.exists()),
                "model_exists": bool(model_path and model_path.exists()),
                "config_exists": bool(config_path and config_path.exists())
                if config_path
                else None,
                "routes": {
                    preference: {
                        "selected_model": str(resolve_voice_route(language, preference).model_path),
                        "selected_voice": resolve_voice_route(language, preference).resolved_preference,
                        "fallback_used": resolve_voice_route(language, preference).fallback_used,
                        "model_exists": resolve_voice_route(language, preference).model_path.exists(),
                    }
                    for preference in ("feminine", "masculine", "neutral", "auto")
                },
            }
        return {
            "provider": self.name,
            "executable": PIPER_EXECUTABLE,
            "supported_languages": [
                {"code": code, "name": PIPER_LANGUAGE_NAMES[code]}
                for code in PIPER_SUPPORTED_LANGUAGES
            ],
            "ready": any(voice["ready"] for voice in voices.values()),
            "voices": voices,
        }

    async def synthesize(
        self,
        text: str,
        language: str | None = None,
        voice_preference: str | None = "auto",
        speech_profile: str = "natural",
    ) -> TTSResult:
        if not text.strip():
            raise ValueError("Text is required for TTS")
        model = _voice_model_for(language, voice_preference)
        config = _voice_config_for(language, voice_preference)
        route = resolve_voice_route(language, voice_preference)
        normalized_language = route.requested_language
        if normalized_language not in PIPER_SUPPORTED_LANGUAGES:
            raise TTSUnavailableError(f"No Piper language configured for: {language}")
        if not model:
            raise TTSUnavailableError(
                f"PIPER_VOICE_MODEL_{normalized_language.upper()} is not configured"
            )
        if not Path(model).exists():
            raise TTSUnavailableError(f"Piper voice model not found: {model}")

        started = perf_counter()
        normalized_profile = speech_profile if speech_profile in SPEECH_PROFILES else "natural"
        normalized_text = prepare_tts_text(text.strip())
        audio_bytes, output_file = await asyncio.to_thread(
            self._run_piper,
            normalized_text,
            model,
            config,
            normalized_profile,
        )
        return TTSResult(
            audio_bytes=audio_bytes,
            mime_type="audio/wav",
            provider=self.name,
            latency_ms=int((perf_counter() - started) * 1000),
            requested_voice=route.requested_preference,
            selected_voice=route.resolved_preference,
            selected_model=model,
            selected_config=config or None,
            output_file=output_file,
            speech_profile=normalized_profile,
            fallback_used=route.fallback_used,
        )

    def _run_piper(
        self,
        text: str,
        model: str,
        config: str,
        speech_profile: str,
    ) -> tuple[bytes, str]:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as audio_file:
            audio_path = Path(audio_file.name)
        profile = SPEECH_PROFILES[speech_profile]

        command = [
            PIPER_EXECUTABLE,
            "--model",
            model,
            "--output_file",
            str(audio_path),
        ]
        if config:
            command.extend(["--config", config])
        length_scale = PIPER_LENGTH_SCALE or profile["length_scale"]
        sentence_silence = PIPER_SENTENCE_SILENCE or profile["sentence_silence"]
        if length_scale:
            command.extend(["--length_scale", length_scale])
        if sentence_silence:
            command.extend(["--sentence_silence", sentence_silence])
        if profile["noise_scale"]:
            command.extend(["--noise_scale", profile["noise_scale"]])
        if profile["noise_w"]:
            command.extend(["--noise_w", profile["noise_w"]])

        try:
            logger.info(
                json.dumps(
                    {
                        "event": "tts.piper_command",
                        "requested_profile": speech_profile,
                        "selected_voice_model": model,
                        "selected_voice_config": config or None,
                        "output_file": str(audio_path),
                    },
                    ensure_ascii=False,
                    sort_keys=True,
                )
            )
            completed = subprocess.run(
                command,
                input=text.encode("utf-8"),
                capture_output=True,
                timeout=PIPER_TIMEOUT_SECONDS,
                check=False,
            )
            if completed.returncode != 0:
                error = (
                    completed.stderr.decode("utf-8", errors="replace").strip()
                    or completed.stdout.decode("utf-8", errors="replace").strip()
                )
                raise TTSUnavailableError(f"Piper failed: {error}")
            return audio_path.read_bytes(), str(audio_path)
        except FileNotFoundError as exc:
            raise TTSUnavailableError(
                f"Piper executable not found: {PIPER_EXECUTABLE}"
            ) from exc
        except subprocess.TimeoutExpired as exc:
            raise TTSUnavailableError("Piper synthesis timed out") from exc
        finally:
            audio_path.unlink(missing_ok=True)


class TTSService:
    def __init__(self, provider: TTSProvider | None = None) -> None:
        self.provider = provider or PiperProvider()

    def status(self) -> dict:
        return self.provider.status()

    async def synthesize(
        self,
        text: str,
        language: str | None = None,
        voice_preference: str | None = "auto",
        speech_profile: str = "natural",
    ) -> TTSResult:
        try:
            result = await self.provider.synthesize(
                text,
                language=language,
                voice_preference=voice_preference,
                speech_profile=speech_profile,
            )
        except Exception as exc:
            logger.warning(
                json.dumps(
                    {
                        "event": "tts.failure",
                        "provider": getattr(self.provider, "name", TTS_PROVIDER),
                        "language": language,
                        "voice_preference": voice_preference,
                        "speech_profile": speech_profile,
                        "text_length": len(text),
                        "error": str(exc),
                    },
                    ensure_ascii=False,
                    sort_keys=True,
                )
            )
            raise

        logger.info(
            json.dumps(
                {
                    "event": "tts.success",
                    "provider": result.provider,
                    "language": language,
                    "voice_preference": voice_preference,
                    "selected_voice": result.selected_voice,
                    "selected_model": result.selected_model,
                    "output_file": result.output_file,
                    "speech_profile": result.speech_profile,
                    "fallback_used": result.fallback_used,
                    "latency_ms": result.latency_ms,
                    "audio_bytes": len(result.audio_bytes),
                    "text_length": len(text),
                },
                ensure_ascii=False,
                sort_keys=True,
            )
        )
        return result


tts_service = TTSService()
