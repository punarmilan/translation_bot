"""Regression tests for Phase 9: AI Models & AI Configuration.

Covers the admin-backend side of the audit findings:
- whisper_model/whisper_beam_size on the AI Models page are the same knob as
  Translation Settings' stt_model/beam_size (the fields app/stt/service.py on
  the public backend actually reads) rather than a second, disconnected copy.
- Server-side validation for model names, numeric ranges, and single-supported
  provider values (invalid config should never silently persist).
- whisper_device/whisper_compute_type are deployment-controlled and can't be
  changed through this API.
- Voice routing rejects unknown voice model keys.
"""


def test_ai_settings_defaults_have_sane_shape(client):
    fetched = client.get("/api/admin/ai-settings")
    assert fetched.status_code == 200
    body = fetched.json()
    assert body["key"] == "ai_models"
    assert body["values"]["whisper_model"] == "base"
    assert body["values"]["stt_provider"] == "faster_whisper"
    assert body["values"]["tts_provider"] == "piper"


def test_whisper_model_change_mirrors_into_translation_settings(client):
    updated = client.patch("/api/admin/ai-settings", json={"values": {"whisper_model": "small", "whisper_beam_size": 8}})
    assert updated.status_code == 200
    assert updated.json()["values"]["whisper_model"] == "small"
    assert updated.json()["values"]["whisper_beam_size"] == 8

    # The Translation Settings document -- the one app/stt/service.py actually
    # reads from at runtime -- must reflect the same values, not just the
    # ai_models document.
    translation = client.get("/api/admin/translation-settings")
    assert translation.status_code == 200
    assert translation.json()["values"]["stt_model"] == "small"
    assert translation.json()["values"]["beam_size"] == 8

    # And the AI Models page itself must read back the live value on GET,
    # not a stale independent copy.
    refetched = client.get("/api/admin/ai-settings")
    assert refetched.json()["values"]["whisper_model"] == "small"
    assert refetched.json()["values"]["whisper_beam_size"] == 8


def test_translation_provider_url_change_mirrors_into_translation_settings(client):
    updated = client.patch("/api/admin/ai-settings", json={"values": {"translation_provider_url": "http://libretranslate.internal:5000"}})
    assert updated.status_code == 200
    assert updated.json()["values"]["translation_provider_url"] == "http://libretranslate.internal:5000"

    # app/translation/service.py's LibreTranslateProvider reads
    # libretranslate_endpoint, not translation_provider_url -- confirm the
    # write-through actually landed on the field that's consumed.
    translation = client.get("/api/admin/translation-settings")
    assert translation.json()["values"]["libretranslate_endpoint"] == "http://libretranslate.internal:5000"


def test_whisper_device_and_compute_type_cannot_be_changed(client):
    updated = client.patch("/api/admin/ai-settings", json={"values": {"whisper_device": "cuda", "whisper_compute_type": "float16"}})
    assert updated.status_code == 200
    # Silently stripped before persisting -- not an error, since the admin
    # isn't submitting anything invalid, it's just a field that can't take
    # effect from here (see AI_SETTINGS_READONLY_KEYS).
    assert "whisper_device" not in updated.json()["values"]

    refetched = client.get("/api/admin/ai-settings")
    assert refetched.json()["values"]["whisper_device"] == "cpu"
    assert refetched.json()["values"]["whisper_compute_type"] == "int8"


def test_unknown_whisper_model_is_rejected(client):
    response = client.patch("/api/admin/ai-settings", json={"values": {"whisper_model": "gpt-5-turbo"}})
    assert response.status_code == 400
    assert "Whisper model" in response.json()["detail"]


def test_beam_size_out_of_range_is_rejected(client):
    response = client.patch("/api/admin/ai-settings", json={"values": {"whisper_beam_size": 50}})
    assert response.status_code == 400

    response_low = client.patch("/api/admin/ai-settings", json={"values": {"whisper_beam_size": 0}})
    assert response_low.status_code == 400


def test_unsupported_stt_provider_is_rejected(client):
    response = client.patch("/api/admin/ai-settings", json={"values": {"stt_provider": "google_speech"}})
    assert response.status_code == 400
    assert "stt_provider" in response.json()["detail"]


def test_unsupported_translation_provider_is_rejected(client):
    response = client.patch("/api/admin/ai-settings", json={"values": {"translation_provider": "deepl"}})
    assert response.status_code == 400


def test_negative_piper_timeout_is_rejected(client):
    response = client.patch("/api/admin/ai-settings", json={"values": {"piper_timeout_seconds": -5}})
    assert response.status_code == 400


def test_translation_settings_rejects_unknown_stt_model(client):
    response = client.patch("/api/admin/translation-settings", json={"values": {"stt_model": "not-a-real-model"}})
    assert response.status_code == 400


def test_voice_routing_rejects_unknown_voice_key(client):
    response = client.post("/api/admin/voices/routing", json={"routing": {"en": {"neutral": "does-not-exist"}}})
    assert response.status_code == 400
    assert "Unknown voice model" in response.json()["detail"]


def test_voice_routing_accepts_known_voice_key(client):
    created = client.post("/api/admin/voices", json={"key": "en-lessac", "name": "Lessac", "value": None})
    assert created.status_code == 201

    response = client.post("/api/admin/voices/routing", json={"routing": {"en": {"neutral": "en-lessac"}}})
    assert response.status_code == 200
    assert response.json()["values"]["en"]["neutral"] == "en-lessac"


def test_voice_routing_allows_empty_assignment_for_fallback(client):
    response = client.post("/api/admin/voices/routing", json={"routing": {"en": {"neutral": ""}}})
    assert response.status_code == 200


def test_ai_settings_get_requires_translation_read_permission(client):
    from bson import ObjectId
    from app import security
    from app.main import app as fastapi_app

    async def _limited_admin():
        return {"_id": ObjectId(), "email": "limited@test.local", "admin_permissions": ["dashboard.read"]}

    fastapi_app.dependency_overrides[security.require_admin] = _limited_admin
    response = client.get("/api/admin/ai-settings")
    assert response.status_code == 403
