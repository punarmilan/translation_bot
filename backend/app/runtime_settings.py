import logging
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


class RuntimeSettingsManager:
    def __init__(self) -> None:
        # Phase 10 audit: live_captions/recording/screen_sharing/waiting_room/
        # captions were removed from here -- they were pure duplicates of
        # meeting_policy's captions_enabled_default/recording_enabled_default/
        # screen_sharing_enabled/waiting_room_enabled (see runtime_settings.py's
        # meeting_policy dict below), which are the ones actually snapshotted
        # onto rooms and enforced. Two configuration paths for the same
        # concept is exactly the kind of drift meeting_policy was built to
        # prevent -- keeping both invites an admin to toggle the dead one and
        # wonder why nothing changed.
        self.feature_flags: dict[str, bool] = {
            "video_calling": True,
            "voice_translation": True,
            "meeting_summary": True,
            "experimental_features": False,
            "stt": True,
            "tts": True,
            "whiteboard": True,
            "files": True,
            "meeting_notes": True,
            "ai_summary": True,
            "diagnostics": True,
            "blogs": True,
            "payments": False,
            "invitations": True,
            "moderator_controls": True,
            "breakout_rooms": False,
            "reactions": True,
        }
        self.branding_settings: dict = {
            "product_name": "VOXO",
            "site_title": "VOXO — Real-Time Multilingual Platform",
            "logo_url": "",
            "logo_dark_url": "",
            "favicon_url": "",
            "favicon_dark_url": "",
            "og_image": "",
            "twitter_card": "",
            "meta_description": "Meet, speak, and collaborate in any language instantly with self-hosted AI voice translation.",
            "seo_keywords": "multilingual meeting, voice translation, whisper stt, piper tts, self-hosted AI, webrtc",
            "accent_color": "#3B82F6",
            "primary_color": "#0F172A",
            "secondary_color": "#1E293B",
            "font_family": "Inter, system-ui, sans-serif",
            "heading_font_family": "",
            "border_radius": "0.75rem",
            "button_style": "glass",
            "footer_text": "Meet, speak, and collaborate across languages.",
            "copyright_text": "© 2026 VOXO by WorknAI Technologies India Pvt. Ltd. All rights reserved.",
            "company_name": "WorknAI Technologies India Pvt. Ltd.",
            "company_email": "support@worknai.tech",
            "company_website": "",
            "social_twitter": "",
            "social_linkedin": "",
            "social_github": "",
            "social_youtube": "",
        }
        self.translation_settings: dict = {
            "libretranslate_endpoint": "http://127.0.0.1:5000",
            "stt_model": "base",
            "beam_size": 5,
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
        # AI Management page's own settings document (platform_settings{key:"ai_models"}).
        # whisper_model/whisper_beam_size are display/edit mirrors of
        # translation_settings' stt_model/beam_size (the actual values
        # STTProvider reads) rather than a second independent source of
        # truth -- see admin-backend's update_ai_settings() write-through.
        # whisper_device/whisper_compute_type are deployment-controlled
        # (WHISPER_DEVICE/WHISPER_COMPUTE_TYPE env vars on this process) and
        # are never written from here.
        self.ai_settings: dict = {
            "stt_provider": "faster_whisper",
            "whisper_model": "base",
            "whisper_beam_size": 5,
            "whisper_device": "cpu",
            "whisper_compute_type": "int8",
            "tts_provider": "piper",
            "piper_default_voice": "en-neutral",
            "piper_timeout_seconds": 45,
            "translation_provider": "libretranslate",
            "translation_provider_url": "http://127.0.0.1:5000",
            "voice_auto_download": False,
        }
        # Per-language/preference Piper voice assignments set via
        # /api/admin/voices/routing (see VoicesPage.jsx); consumed by
        # app/tts/voice_router.py's resolve_voice_route().
        self.voice_routing: dict = {}
        self.general_settings: dict = {
            "product_name": "VOXO",
            "support_email": "support@worknai.tech",
            "maintenance_mode": False,
            "default_language": "en",
            "meeting_retention_days": 30,
            "site_title": "VOXO",
            "logo_url": "",
            "theme": "dark",
            "email_from": "",
            "jwt_expiration_minutes": 60,
            "stun_server": "stun:stun.l.google.com:19302",
        }
        self.meeting_policy: dict = {
            "max_participants": 12,
            "waiting_room_enabled": False,
            "screen_sharing_enabled": True,
            "recording_enabled_default": True,
            "translation_enabled_default": True,
            "captions_enabled_default": True,
            "meeting_timeout_minutes": 240,
            "idle_participant_timeout_minutes": 30,
            "allow_guest_join": True,
            "require_host_to_start": False,
            "max_file_size_mb": 25,
            "allowed_file_extensions": [
                ".pdf", ".docx", ".doc", ".ppt", ".pptx",
                ".png", ".jpg", ".jpeg", ".gif", ".webp",
                ".mp3", ".wav", ".m4a", ".ogg",
                ".mp4", ".webm", ".mov", ".avi",
            ],
        }
        self.landing_sections: list = []
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

            brand_doc = await db["platform_settings"].find_one({"key": "branding"})
            if brand_doc and "values" in brand_doc:
                self.branding_settings.update(brand_doc["values"])

            policy_doc = await db["platform_settings"].find_one({"key": "meeting_policy"})
            if policy_doc and "values" in policy_doc:
                self.meeting_policy.update(policy_doc["values"])

            ai_doc = await db["platform_settings"].find_one({"key": "ai_models"})
            if ai_doc and "values" in ai_doc:
                self.ai_settings.update(ai_doc["values"])

            routing_doc = await db["platform_settings"].find_one({"key": "voice_routing"})
            if routing_doc and "values" in routing_doc:
                self.voice_routing.update(routing_doc["values"])

            sections = await db["landing_sections"].find({}).sort("order", 1).to_list(length=100)
            if sections:
                self.landing_sections = sections

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
        elif category == "meeting_policy":
            self.meeting_policy.update(values)
            logger.info(f"Updated meeting policy: {values}")
        elif category == "ai_models":
            self.ai_settings.update(values)
            logger.info(f"Updated AI settings: {values}")
        elif category == "voice_routing":
            self.voice_routing.update(values)
            logger.info(f"Updated voice routing: {values}")

    def update_language(self, code: str, enabled: bool) -> None:
        if enabled:
            self.enabled_languages.add(code)
        else:
            self.enabled_languages.discard(code)
        logger.info(f"Updated language {code} enabled status to {enabled}")


runtime_settings = RuntimeSettingsManager()
