from dataclasses import dataclass
from pathlib import Path

from app.tts.voices import PIPER_VOICE_FILES, local_config_path, local_model_path
from app.tts.voices import (
    PIPER_VOICE_VARIANTS,
    local_variant_config_path,
    local_variant_model_path,
)


VOICE_PREFERENCES = {"feminine", "masculine", "neutral", "auto"}

@dataclass(frozen=True)
class VoiceRoute:
    requested_language: str
    resolved_language: str
    requested_preference: str
    resolved_preference: str
    model_path: Path
    config_path: Path
    fallback_used: bool
    repo_model_file: str


def resolve_voice_route(
    language: str | None,
    voice_preference: str | None = "auto",
) -> VoiceRoute:
    requested_language = (language or "en").lower().split("-")[0]
    requested_preference = (voice_preference or "auto").lower().strip()
    if requested_preference not in VOICE_PREFERENCES:
        requested_preference = "auto"

    if requested_language not in PIPER_VOICE_FILES:
        requested_language = "en"

    variants = PIPER_VOICE_VARIANTS.get(requested_language, {})
    resolved_preference = requested_preference
    if requested_preference not in variants:
        resolved_preference = "auto" if "auto" in variants else "neutral"

    if requested_language in PIPER_VOICE_VARIANTS and resolved_preference in variants:
        repo_model_file = variants[resolved_preference]
        model_path = local_variant_model_path(requested_language, resolved_preference)
        config_path = local_variant_config_path(requested_language, resolved_preference)
    else:
        resolved_preference = "auto"
        repo_model_file = PIPER_VOICE_FILES[requested_language]
        model_path = local_model_path(requested_language)
        config_path = local_config_path(requested_language)

    return VoiceRoute(
        requested_language=requested_language,
        resolved_language=requested_language,
        requested_preference=requested_preference,
        resolved_preference=resolved_preference,
        model_path=model_path,
        config_path=config_path,
        fallback_used=resolved_preference != requested_preference,
        repo_model_file=repo_model_file,
    )
