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


import wave
import struct
import math
import io

def generate_chime_wav(text: str) -> bytes:
    sample_rate = 22050
    duration_sec = max(0.6, min(3.0, len(text) * 0.08))
    num_samples = int(sample_rate * duration_sec)
    buf = bytearray()
    for i in range(num_samples):
        t = i / sample_rate
        decay = math.exp(-3.0 * t / duration_sec)
        val = (math.sin(2 * math.pi * 440 * t) * 0.5 + math.sin(2 * math.pi * 660 * t) * 0.3) * decay
        sample = int(val * 32767 * 0.4)
        buf.extend(struct.pack("<h", max(-32768, min(32767, sample))))
    wav_io = io.BytesIO()
    with wave.open(wav_io, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(buf)
    return wav_io.getvalue()


class PersistentPiperProcess:
    def __init__(self, model_path: str, config_path: str | None) -> None:
        self.model_path = model_path
        self.config_path = config_path
        self.process: subprocess.Popen | None = None
        self.lock = asyncio.Lock()

    def start(self) -> None:
        if not self.model_path or not os.path.exists(self.model_path):
            return
        command = [
            PIPER_EXECUTABLE,
            "--model",
            self.model_path,
            "--json-input",
        ]
        if self.config_path and os.path.exists(self.config_path):
            command.extend(["--config", self.config_path])
        logger.info(f"Starting persistent Piper process for model: {self.model_path}")
        try:
            self.process = subprocess.Popen(
                command,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
        except Exception as err:
            logger.warning(f"Could not start Piper executable ({PIPER_EXECUTABLE}): {err}")
            self.process = None

    def stop(self) -> None:
        if self.process:
            try:
                self.process.terminate()
                self.process.wait(timeout=2.0)
            except Exception:
                try:
                    self.process.kill()
                except Exception:
                    pass
            self.process = None

    async def synthesize(self, text: str, length_scale: str, sentence_silence: str, noise_scale: str, noise_w: str) -> tuple[bytes, str]:
        async with self.lock:
            if not self.process or self.process.poll() is not None:
                self.start()

            if not self.process:
                audio_bytes = generate_chime_wav(text)
                return audio_bytes, "fallback.wav"

            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
                temp_path = Path(temp_file.name)

            try:
                payload = {
                    "text": text,
                    "output_file": str(temp_path),
                }
                if length_scale:
                    payload["length_scale"] = float(length_scale)
                if sentence_silence:
                    payload["sentence_silence"] = float(sentence_silence)
                if noise_scale:
                    payload["noise_scale"] = float(noise_scale)
                if noise_w:
                    payload["noise_w"] = float(noise_w)

                raw_line = (json.dumps(payload) + "\n").encode("utf-8")
                await asyncio.to_thread(self._write_stdin, raw_line)
                stdout_line = await asyncio.to_thread(self._read_stdout)

                if not stdout_line or not temp_path.exists() or temp_path.stat().st_size == 0:
                    logger.warning("Piper output unreadable or empty. Falling back to synthetic audio.")
                    audio_bytes = generate_chime_wav(text)
                    return audio_bytes, "fallback.wav"

                audio_bytes = await asyncio.to_thread(temp_path.read_bytes)
                return audio_bytes, str(temp_path)
            except Exception as err:
                logger.warning(f"Piper synthesis error: {err}. Using audio fallback.")
                audio_bytes = generate_chime_wav(text)
                return audio_bytes, "fallback.wav"
            finally:
                if temp_path.exists():
                    await asyncio.to_thread(temp_path.unlink, True)

    def _write_stdin(self, data: bytes) -> None:
        self.process.stdin.write(data)
        self.process.stdin.flush()

    def _read_stdout(self) -> str:
        line = self.process.stdout.readline()
        return line.decode("utf-8", errors="replace").strip()


class PiperProvider:
    name = "piper"

    def __init__(self) -> None:
        self._processes: dict[str, PersistentPiperProcess] = {}

    async def initialize(self) -> None:
        # Pre-warm ready voice models on startup
        for language in PIPER_SUPPORTED_LANGUAGES:
            for preference in ("auto", "neutral", "feminine", "masculine"):
                try:
                    route = resolve_voice_route(language, preference)
                    model = str(route.model_path)
                    config = str(route.config_path) if route.config_path.exists() else None
                    if route.model_path.exists() and model not in self._processes:
                        proc = PersistentPiperProcess(model, config)
                        await asyncio.to_thread(proc.start)
                        self._processes[model] = proc
                except Exception as e:
                    logger.error(f"Failed to pre-warm voice model: {e}")

    async def close(self) -> None:
        for proc in list(self._processes.values()):
            await asyncio.to_thread(proc.stop)
        self._processes.clear()

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

        if model not in self._processes:
            proc = PersistentPiperProcess(model, config)
            await asyncio.to_thread(proc.start)
            self._processes[model] = proc
        else:
            proc = self._processes[model]

        profile = SPEECH_PROFILES[normalized_profile]
        length_scale = PIPER_LENGTH_SCALE or profile["length_scale"]
        sentence_silence = PIPER_SENTENCE_SILENCE or profile["sentence_silence"]
        noise_scale = profile["noise_scale"]
        noise_w = profile["noise_w"]

        audio_bytes, output_file = await proc.synthesize(
            normalized_text,
            length_scale,
            sentence_silence,
            noise_scale,
            noise_w,
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


class TTSCache:
    def __init__(self, max_size: int = 512) -> None:
        self.max_size = max_size
        self._cache: dict[tuple, TTSResult] = {}
        self._keys: list[tuple] = []
        self._lock = asyncio.Lock()

    async def get(self, key: tuple) -> TTSResult | None:
        async with self._lock:
            if key in self._cache:
                self._keys.remove(key)
                self._keys.append(key)
                return self._cache[key]
            return None

    async def set(self, key: tuple, value: TTSResult) -> None:
        async with self._lock:
            if key in self._cache:
                self._keys.remove(key)
            elif len(self._cache) >= self.max_size:
                oldest = self._keys.pop(0)
                del self._cache[oldest]
            self._cache[key] = value
            self._keys.append(key)


class TTSService:
    def __init__(self, provider: TTSProvider | None = None) -> None:
        self.provider = provider or PiperProvider()
        self.cache = TTSCache(max_size=512)

    async def initialize(self) -> None:
        if hasattr(self.provider, "initialize"):
            await self.provider.initialize()

    async def close(self) -> None:
        if hasattr(self.provider, "close"):
            await self.provider.close()

    def status(self) -> dict:
        return self.provider.status()

    async def synthesize(
        self,
        text: str,
        language: str | None = None,
        voice_preference: str | None = "auto",
        speech_profile: str = "natural",
    ) -> TTSResult:
        cache_key = (text.strip(), language, voice_preference, speech_profile)
        cached = await self.cache.get(cache_key)
        if cached is not None:
            return cached

        try:
            result = await self.provider.synthesize(
                text,
                language=language,
                voice_preference=voice_preference,
                speech_profile=speech_profile,
            )
            await self.cache.set(cache_key, result)
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
