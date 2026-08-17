"""Regression tests for the Phase 2 "enterprise control center" additions:
AI Models settings, Meeting Policy settings (+ its public-safe mirror), and
the read-only Infrastructure reference endpoint.
"""


def test_ai_settings_round_trips_and_has_sane_defaults(client):
    fetched = client.get("/api/admin/ai-settings")
    assert fetched.status_code == 200
    body = fetched.json()
    assert body["key"] == "ai_models"
    assert body["values"]["whisper_model"] == "base"
    assert body["values"]["tts_provider"] == "piper"

    updated = client.patch("/api/admin/ai-settings", json={"values": {**body["values"], "whisper_model": "small", "whisper_beam_size": 8}})
    assert updated.status_code == 200
    assert updated.json()["values"]["whisper_model"] == "small"
    assert updated.json()["values"]["whisper_beam_size"] == 8

    refetched = client.get("/api/admin/ai-settings")
    assert refetched.json()["values"]["whisper_model"] == "small"


def test_meeting_policy_round_trips_and_has_sane_defaults(client):
    fetched = client.get("/api/admin/meeting-policy")
    assert fetched.status_code == 200
    body = fetched.json()
    assert body["key"] == "meeting_policy"
    assert body["values"]["max_participants"] == 12
    assert body["values"]["waiting_room_enabled"] is False
    # Phase 8: file-sharing limits are part of the same meeting_policy document
    # rather than a duplicate settings surface, defaulting to the values that
    # were previously hardcoded in backend/app/routes.py's upload route.
    assert body["values"]["max_file_size_mb"] == 25
    assert ".pdf" in body["values"]["allowed_file_extensions"]

    new_values = {**body["values"], "max_participants": 50, "waiting_room_enabled": True, "max_file_size_mb": 10}
    updated = client.patch("/api/admin/meeting-policy", json={"values": new_values})
    assert updated.status_code == 200
    assert updated.json()["values"]["max_participants"] == 50
    assert updated.json()["values"]["waiting_room_enabled"] is True
    assert updated.json()["values"]["max_file_size_mb"] == 10


def test_meeting_policy_public_mirror_only_exposes_safe_keys(client):
    client.patch("/api/admin/meeting-policy", json={"values": {
        "max_participants": 25,
        "waiting_room_enabled": True,
        "screen_sharing_enabled": True,
        "recording_enabled_default": False,
        "translation_enabled_default": True,
        "captions_enabled_default": True,
        "meeting_timeout_minutes": 120,
        "idle_participant_timeout_minutes": 15,
        "allow_guest_join": False,
        "require_host_to_start": True,
        "max_file_size_mb": 15,
        "allowed_file_extensions": [".pdf", ".png"],
        "internal_note": "should never be exposed publicly",
    }})

    public = client.get("/api/public/meeting-policy")
    assert public.status_code == 200
    values = public.json()["values"]
    assert values["max_participants"] == 25
    assert values["waiting_room_enabled"] is True
    assert values["max_file_size_mb"] == 15
    assert values["allowed_file_extensions"] == [".pdf", ".png"]
    assert "internal_note" not in values


def test_infrastructure_reference_never_leaks_secret_values(client):
    response = client.get("/api/admin/infrastructure")
    assert response.status_code == 200
    body = response.json()

    serialized = str(body)
    # The default placeholder secrets from admin-backend/app/config.py must
    # never appear verbatim in the response -- only a boolean per secret.
    assert "replace-with" not in serialized
    assert set(body["secrets_configured"].keys()) == {
        "ADMIN_JWT_SECRET", "CONTROL_PLANE_SECRET", "CMS_PREVIEW_SECRET", "ADMIN_BOOTSTRAP_CODE",
    }
    assert all(isinstance(v, bool) for v in body["secrets_configured"].values())


def test_infrastructure_reference_lists_known_services_and_routes(client):
    response = client.get("/api/admin/infrastructure")
    body = response.json()
    service_names = {svc["name"] for svc in body["services"]}
    assert {"backend", "admin-backend", "coturn", "mongodb", "caddy", "libretranslate"} <= service_names

    hosts = {route["host"] for route in body["caddy_routes"]}
    assert {"giftme.watch", "api.giftme.watch", "admin.giftme.watch"} <= hosts

    assert "TCP+UDP 3478 (TURN client traffic)" in body["turn_stun"]["required_firewall_ports"]


def test_infrastructure_reference_requires_admin_permission(client):
    from bson import ObjectId
    from app import security
    from app.main import app as fastapi_app

    async def _limited_admin():
        return {"_id": ObjectId(), "email": "limited@test.local", "admin_permissions": ["dashboard.read"]}

    fastapi_app.dependency_overrides[security.require_admin] = _limited_admin
    response = client.get("/api/admin/infrastructure")
    assert response.status_code == 403
