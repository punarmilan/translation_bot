import asyncio
import json
import logging
import os
import re
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any, Protocol

import httpx
from langdetect import DetectorFactory, LangDetectException, detect_langs


DetectorFactory.seed = 0
logger = logging.getLogger(__name__)

LIBRETRANSLATE_URL = os.getenv("LIBRETRANSLATE_URL", "http://127.0.0.1:5000")
REQUEST_TIMEOUT_SECONDS = float(os.getenv("TRANSLATION_TIMEOUT_SECONDS", "8.0"))
CACHE_MAX_SIZE = int(os.getenv("TRANSLATION_CACHE_MAX_SIZE", "512"))
MIN_DETECTION_CONFIDENCE = float(os.getenv("MIN_DETECTION_CONFIDENCE", "0.72"))

LANGUAGE_ALIASES = {
    "zh-cn": "zh",
    "zh-tw": "zh",
}

LANGUAGE_NAMES = {
    "ar": "Arabic",
    "de": "German",
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "hi": "Hindi",
    "it": "Italian",
    "nl": "Dutch",
    "pt": "Portuguese",
    "ru": "Russian",
}
SUPPORTED_LANGUAGES = set(LANGUAGE_NAMES)

SHORT_TEXT_FALLBACKS = {
    ("hi", "en", "\u0928\u092e\u0938\u094d\u0924\u0947"): "Hello",
    ("hi", "en", "\u0928\u092e\u0938\u094d\u0915\u093e\u0930"): "Hello",
    ("en", "hi", "hello"): "\u0928\u092e\u0938\u094d\u0924\u0947",
}

DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]")
LATIN_RE = re.compile(r"[A-Za-z]")
JAPANESE_RE = re.compile(r"[\u3040-\u30FF\u3400-\u9FFF]")
SIGNAL_RE = re.compile(r"[\w\u0900-\u097F\u3040-\u30FF\u3400-\u9FFF]", re.UNICODE)


@dataclass(frozen=True)
class LanguageDetection:
    language: str
    candidates: list[tuple[str, float]]
    mixed_language: bool
    confidence: float = 0.0
    detection_source: str = "unknown"


@dataclass(frozen=True)
class TranslationResult:
    original: str
    translated: str
    source_language: str
    target_language: str
    status: str
    error: str | None = None
    cache_hit: bool = False
    mixed_language: bool = False


@dataclass(frozen=True)
class TranslationContext:
    speaker_language: str
    target_language: str
    speaker_pronouns: str | None = None
    speaker_voice_preference: str | None = None
    speaker_session_id: str | None = None


class TranslationProvider(Protocol):
    """Async provider contract for LibreTranslate, fine-tuned models, or hybrids."""

    name: str

    async def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        ...


class TranslationCache:
    def __init__(self, max_size: int) -> None:
        self.max_size = max_size
        self._items: OrderedDict[tuple[str, str, str, str], str] = OrderedDict()

    def get(
        self,
        provider_name: str,
        text: str,
        source_lang: str,
        target_lang: str,
    ) -> str | None:
        key = self._key(provider_name, text, source_lang, target_lang)
        value = self._items.get(key)
        if value is None:
            return None
        self._items.move_to_end(key)
        return value

    def set(
        self,
        provider_name: str,
        text: str,
        source_lang: str,
        target_lang: str,
        translated_text: str,
    ) -> None:
        key = self._key(provider_name, text, source_lang, target_lang)
        self._items[key] = translated_text
        self._items.move_to_end(key)

        while len(self._items) > self.max_size:
            self._items.popitem(last=False)

    @staticmethod
    def _key(
        provider_name: str,
        text: str,
        source_lang: str,
        target_lang: str,
    ) -> tuple[str, str, str, str]:
        return (provider_name, text.strip(), source_lang, target_lang)


class LibreTranslateProvider:
    name = "libretranslate"

    def __init__(
        self,
        base_url: str = LIBRETRANSLATE_URL,
        timeout_seconds: float = REQUEST_TIMEOUT_SECONDS,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    async def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        payload = {
            "q": text,
            "source": source_lang,
            "target": target_lang,
            "format": "text",
        }

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(f"{self.base_url}/translate", json=payload)
            if response.status_code == 400 and source_lang != "auto":
                payload["source"] = "auto"
                logger.info(
                    json.dumps(
                        {
                            "event": "translation.provider_retry",
                            "provider": self.name,
                            "original_source_language": source_lang,
                            "retry_source_language": "auto",
                            "target_language": target_lang,
                        },
                        sort_keys=True,
                    )
                )
                response = await client.post(f"{self.base_url}/translate", json=payload)
            response.raise_for_status()
            response_payload = response.json()

        translated_text = extract_translated_text(response_payload)
        if not translated_text:
            raise TranslationProviderError("missing translatedText")
        if is_language_label(translated_text):
            raise TranslationProviderError(f"language label response: {translated_text}")

        return translated_text


class TranslationProviderError(Exception):
    pass


class TranslationService:
    def __init__(
        self,
        provider: TranslationProvider | None = None,
        cache: TranslationCache | None = None,
    ) -> None:
        self.provider = provider or LibreTranslateProvider()
        self.cache = cache or TranslationCache(max_size=CACHE_MAX_SIZE)

    async def translate_text(
        self,
        text: str,
        target_lang: str,
        source_lang: str = "auto",
        mixed_language: bool = False,
        context: TranslationContext | None = None,
    ) -> TranslationResult:
        source = normalize_language(source_lang)
        target = normalize_language(target_lang)
        api_source = source if source in SUPPORTED_LANGUAGES else "auto"

        if not should_translate(source, target):
            result = TranslationResult(
                original=text,
                translated=text,
                source_language=source,
                target_language=target,
                status="skipped_same_language",
                mixed_language=mixed_language,
            )
            log_translation_event("translation.skipped", result=result)
            return result

        cached = self.cache.get(self.provider.name, text, api_source, target)
        if cached is not None:
            result = TranslationResult(
                original=text,
                translated=cached,
                source_language=source,
                target_language=target,
                status="success",
                cache_hit=True,
                mixed_language=mixed_language,
            )
            log_translation_event("translation.cache_hit", result=result)
            return result

        log_translation_event(
            "translation.request",
            source_language=source,
            provider_source_language=api_source,
            target_language=target,
            provider=self.provider.name,
            mixed_language=mixed_language,
            speaker_pronouns=context.speaker_pronouns if context else None,
            speaker_voice_preference=context.speaker_voice_preference if context else None,
            speaker_session_id=context.speaker_session_id if context else None,
        )

        try:
            translated_text = await self.provider.translate(text, api_source, target)
        except (httpx.HTTPError, ValueError, TranslationProviderError) as exc:
            fallback = fallback_translation(text, source, target) or text
            result = TranslationResult(
                original=text,
                translated=fallback,
                source_language=source,
                target_language=target,
                status="fallback_unavailable",
                error=str(exc),
                mixed_language=mixed_language,
            )
            log_translation_event("translation.failure", result=result)
            return result

        self.cache.set(self.provider.name, text, api_source, target, translated_text)
        result = TranslationResult(
            original=text,
            translated=translated_text,
            source_language=source,
            target_language=target,
            status="success",
            mixed_language=mixed_language,
        )
        log_translation_event("translation.success", result=result)
        return result


translation_service = TranslationService()


def normalize_language(language: str) -> str:
    return LANGUAGE_ALIASES.get(language.lower(), language.lower())


def contains_devanagari(text: str) -> bool:
    return bool(DEVANAGARI_RE.search(text))


def contains_latin(text: str) -> bool:
    return bool(LATIN_RE.search(text))


def contains_japanese(text: str) -> bool:
    return bool(JAPANESE_RE.search(text))


def is_mixed_hindi_english(text: str) -> bool:
    return contains_devanagari(text) and contains_latin(text)


def has_detectable_signal(text: str) -> bool:
    return bool(SIGNAL_RE.search(text))


def should_translate(source_lang: str, target_lang: str) -> bool:
    source = normalize_language(source_lang)
    target = normalize_language(target_lang)
    return source != target


def extract_translated_text(response_payload: dict[str, Any]) -> str | None:
    translated_text = response_payload.get("translatedText")
    if isinstance(translated_text, str) and translated_text.strip():
        return translated_text.strip()
    return None


def fallback_translation(text: str, source_lang: str, target_lang: str) -> str | None:
    normalized_text = text.strip()
    exact = SHORT_TEXT_FALLBACKS.get((source_lang, target_lang, normalized_text))
    if exact:
        return exact

    return SHORT_TEXT_FALLBACKS.get((source_lang, target_lang, normalized_text.lower()))


def is_language_label(text: str) -> bool:
    labels = {name.lower() for name in LANGUAGE_NAMES.values()}
    return text.strip().lower() in labels


def is_hint_compatible_with_text(text: str, language_hint: str) -> bool:
    hint = normalize_language(language_hint)
    if hint in {"hi", "mr"}:
        return contains_devanagari(text) or contains_latin(text)
    if hint in {"en", "es", "fr", "de"}:
        return contains_latin(text) and not contains_devanagari(text)
    if hint == "ja":
        return contains_japanese(text)
    return False


def log_translation_event(event: str, result: TranslationResult | None = None, **fields: Any) -> None:
    payload = {"event": event, **fields}
    if result is not None:
        payload.update(
            {
                "source_language": result.source_language,
                "target_language": result.target_language,
                "translation_status": result.status,
                "translation_result": result.translated,
                "translation_error": result.error,
                "cache_hit": result.cache_hit,
                "mixed_language": result.mixed_language,
            }
        )
    logger.info(json.dumps(payload, ensure_ascii=False, sort_keys=True))


async def detect_language_profile(
    text: str,
    language_hint: str | None = None,
) -> LanguageDetection:
    """Detect source language with script checks, confidence thresholds, and hints."""

    normalized_hint = normalize_language(language_hint) if language_hint else None

    if not has_detectable_signal(text):
        language = normalized_hint or "unknown"
        detection = LanguageDetection(
            language=language,
            candidates=[],
            mixed_language=False,
            confidence=0.0,
            detection_source="hint" if normalized_hint else "empty_signal",
        )
        log_translation_event(
            "language.detected",
            source_language=detection.language,
            confidence=detection.confidence,
            detection_source=detection.detection_source,
            candidates=detection.candidates,
            mixed_language=detection.mixed_language,
        )
        return detection

    if is_mixed_hindi_english(text):
        detection = LanguageDetection(
            language="mixed",
            candidates=[("hi", 0.5), ("en", 0.5)],
            mixed_language=True,
            confidence=1.0,
            detection_source="script",
        )
        log_translation_event(
            "language.detected",
            source_language=detection.language,
            confidence=detection.confidence,
            detection_source=detection.detection_source,
            candidates=detection.candidates,
            mixed_language=detection.mixed_language,
        )
        return detection

    if contains_devanagari(text):
        language = "mr" if normalized_hint == "mr" else "hi"
        detection = LanguageDetection(
            language=language,
            candidates=[(language, 1.0)],
            mixed_language=False,
            confidence=1.0,
            detection_source="hint_script" if language == "mr" else "script",
        )
        log_translation_event(
            "language.detected",
            source_language=detection.language,
            confidence=detection.confidence,
            detection_source=detection.detection_source,
            candidates=detection.candidates,
            mixed_language=detection.mixed_language,
        )
        return detection

    if contains_japanese(text):
        detection = LanguageDetection(
            language="ja",
            candidates=[("ja", 1.0)],
            mixed_language=False,
            confidence=1.0,
            detection_source="script",
        )
        log_translation_event(
            "language.detected",
            source_language=detection.language,
            confidence=detection.confidence,
            detection_source=detection.detection_source,
            candidates=detection.candidates,
            mixed_language=detection.mixed_language,
        )
        return detection

    try:
        detections = await asyncio.to_thread(detect_langs, text)
    except LangDetectException:
        candidates: list[tuple[str, float]] = []
    else:
        candidates = [
            (normalize_language(candidate.lang), candidate.prob) for candidate in detections
        ]

    language = candidates[0][0] if candidates else "unknown"
    confidence = candidates[0][1] if candidates else 0.0
    detection_source = "langdetect"

    if (
        normalized_hint in SUPPORTED_LANGUAGES
        and confidence < MIN_DETECTION_CONFIDENCE
        and is_hint_compatible_with_text(text, normalized_hint)
    ):
        language = normalized_hint
        detection_source = "hint_low_confidence"

    detection = LanguageDetection(
        language=language,
        candidates=candidates,
        mixed_language=False,
        confidence=confidence,
        detection_source=detection_source,
    )
    log_translation_event(
        "language.detected",
        source_language=detection.language,
        confidence=detection.confidence,
        detection_source=detection.detection_source,
        candidates=detection.candidates,
        mixed_language=detection.mixed_language,
    )
    return detection


async def detect_language(text: str) -> str:
    return (await detect_language_profile(text)).language


async def translate(
    text: str,
    target_lang: str,
    source_lang: str = "auto",
) -> str:
    return (await translate_text(text, target_lang, source_lang)).translated


async def translate_text(
    text: str,
    target_lang: str,
    source_lang: str = "auto",
    mixed_language: bool = False,
    context: TranslationContext | None = None,
) -> TranslationResult:
    return await translation_service.translate_text(
        text=text,
        target_lang=target_lang,
        source_lang=source_lang,
        mixed_language=mixed_language,
        context=context,
    )
