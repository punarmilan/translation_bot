from pathlib import Path


PIPER_LANGUAGE_NAMES = {
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

PIPER_REPO_ID = "rhasspy/piper-voices"

PIPER_VOICE_FILES = {
    "ar": "ar/ar_JO/kareem/medium/ar_JO-kareem-medium.onnx",
    "de": "de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx",
    "en": "en/en_US/amy/medium/en_US-amy-medium.onnx",
    "es": "es/es_ES/sharvard/medium/es_ES-sharvard-medium.onnx",
    "fr": "fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx",
    "hi": "hi/hi_IN/pratham/medium/hi_IN-pratham-medium.onnx",
    "it": "it/it_IT/paola/medium/it_IT-paola-medium.onnx",
    "nl": "nl/nl_NL/mls/medium/nl_NL-mls-medium.onnx",
    "pt": "pt/pt_BR/faber/medium/pt_BR-faber-medium.onnx",
    "ru": "ru/ru_RU/irina/medium/ru_RU-irina-medium.onnx",
}

PIPER_VOICE_VARIANTS = {
    "en": {
        "feminine": "en/en_US/amy/medium/en_US-amy-medium.onnx",
        "masculine": "en/en_US/ryan/medium/en_US-ryan-medium.onnx",
        "neutral": "en/en_US/lessac/medium/en_US-lessac-medium.onnx",
        "auto": "en/en_US/amy/medium/en_US-amy-medium.onnx",
    },
    "hi": {
        "neutral": "hi/hi_IN/pratham/medium/hi_IN-pratham-medium.onnx",
        "auto": "hi/hi_IN/pratham/medium/hi_IN-pratham-medium.onnx",
    },
}

BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_PIPER_MODEL_DIR = BACKEND_DIR / "models" / "piper"


def local_model_path(language: str) -> Path:
    return DEFAULT_PIPER_MODEL_DIR / Path(PIPER_VOICE_FILES[language]).name


def local_config_path(language: str) -> Path:
    return DEFAULT_PIPER_MODEL_DIR / f"{Path(PIPER_VOICE_FILES[language]).name}.json"


def local_variant_model_path(language: str, voice_preference: str) -> Path:
    return DEFAULT_PIPER_MODEL_DIR / Path(
        PIPER_VOICE_VARIANTS[language][voice_preference]
    ).name


def local_variant_config_path(language: str, voice_preference: str) -> Path:
    return DEFAULT_PIPER_MODEL_DIR / (
        f"{Path(PIPER_VOICE_VARIANTS[language][voice_preference]).name}.json"
    )
