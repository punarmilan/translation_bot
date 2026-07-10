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

    # Try dynamic voice routing mapping from runtime_settings first!
    try:
        from app.runtime_settings import runtime_settings
        routing = runtime_settings.voice_routing.get(requested_language, {})
        voice_key = routing.get(requested_preference) or routing.get("auto") or routing.get("neutral")
        if voice_key:
            from app.tts.voices import DEFAULT_PIPER_MODEL_DIR
            model_path = DEFAULT_PIPER_MODEL_DIR / f"{voice_key}.onnx"
            config_path = DEFAULT_PIPER_MODEL_DIR / f"{voice_key}.onnx.json"
            if not config_path.exists():
                config_path = DEFAULT_PIPER_MODEL_DIR / f"{voice_key}.json"
            
            if model_path.exists():
                return VoiceRoute(
                    requested_language=requested_language,
                    resolved_language=requested_language,
                    requested_preference=requested_preference,
                    resolved_preference=requested_preference,
                    model_path=model_path,
                    config_path=config_path,
                    fallback_used=False,
                    repo_model_file=f"{voice_key}.onnx",
                )
    except Exception:
        pass

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
