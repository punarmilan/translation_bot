import logging
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


class RuntimeSettingsManager:
    def __init__(self) -> None:
        self.feature_flags: dict[str, bool] = {
            "video_calling": True,
            "voice_translation": True,
            "live_captions": True,
            "recording": True,
            "screen_sharing": True,
            "meeting_summary": True,
            "experimental_features": False,
        }
        self.translation_settings: dict = {
            "libretranslate_endpoint": "http://127.0.0.1:5000",
            "stt_model": "base",
            "detection_confidence": 0.72,
            "cache_timeout_seconds": 3600,
            "translation_timeout_seconds": 8.0,
            "retry_count": 2,
            "maximum_latency_ms": 3500,
            "fallback_language": "en",
            "segment_silence_ms": 900,
            "max_segment_seconds": 15,
            "tts_profile": "natural",
            "auto_play_translated_audio": True,
        }
        self.general_settings: dict = {
            "product_name": "GiftMe Watch",
            "support_email": "",
            "maintenance_mode": False,
            "default_language": "en",
            "meeting_retention_days": 30,
            "site_title": "Translation Bot",
            "logo_url": "",
            "theme": "light",
            "email_from": "",
            "jwt_expiration_minutes": 60,
            "stun_server": "stun:stun.l.google.com:19302",
        }
        self.enabled_languages: set[str] = {"ar", "de", "en", "es", "fr", "hi", "it", "nl", "pt", "ru"}

    async def load_from_db(self, db: AsyncIOMotorDatabase) -> None:
        try:
            # 1. Feature Flags
            flags = await db["feature_flags"].find({}).to_list(length=100)
            for flag in flags:
                key = flag.get("key")
                if key:
                    self.feature_flags[key] = flag.get("enabled", True)

            # 2. Settings
            trans_doc = await db["platform_settings"].find_one({"key": "translation"})
            if trans_doc and "values" in trans_doc:
                self.translation_settings.update(trans_doc["values"])

            gen_doc = await db["platform_settings"].find_one({"key": "general"})
            if gen_doc and "values" in gen_doc:
                self.general_settings.update(gen_doc["values"])

            # 3. Enabled Languages
            langs = await db["platform_languages"].find({"enabled": True}).to_list(length=100)
            if langs:
                self.enabled_languages = {lang["code"] for lang in langs}

            logger.info("Loaded runtime configurations from MongoDB successfully.")
        except Exception as e:
            logger.error(f"Error loading runtime configurations from MongoDB: {e}")

    def update_feature_flag(self, key: str, enabled: bool) -> None:
        self.feature_flags[key] = enabled
        logger.info(f"Updated feature flag {key} to {enabled}")

    def update_settings(self, category: str, values: dict) -> None:
        if category == "translation":
            self.translation_settings.update(values)
            logger.info(f"Updated translation settings: {values}")
        elif category == "general":
            self.general_settings.update(values)
            logger.info(f"Updated general settings: {values}")

    def update_language(self, code: str, enabled: bool) -> None:
        if enabled:
            self.enabled_languages.add(code)
        else:
            self.enabled_languages.discard(code)
        logger.info(f"Updated language {code} enabled status to {enabled}")


runtime_settings = RuntimeSettingsManager()
