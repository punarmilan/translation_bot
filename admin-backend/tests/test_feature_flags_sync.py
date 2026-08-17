"""Regression tests for Phase 10's feature-flag audit
(admin-backend/app/routers/platform.py's FEATURE_FLAG_DEFAULTS):

- Previously only 7 of the ~20 keys the public backend's runtime_settings
  held had an admin-editable default here, so most flags were invisible in
  the Admin Console despite existing at runtime.
- live_captions/recording/screen_sharing/waiting_room/captions were fully
  duplicated by meeting_policy's already-live equivalents and have been
  removed from the feature-flags surface entirely (see runtime_settings.py).
"""

from app.routers.platform import FEATURE_FLAG_DEFAULTS


def test_feature_flag_defaults_no_longer_duplicate_meeting_policy_concepts():
    keys = {item["key"] for item in FEATURE_FLAG_DEFAULTS}
    assert "live_captions" not in keys
    assert "recording" not in keys
    assert "screen_sharing" not in keys
    assert "waiting_room" not in keys
    assert "captions" not in keys


def test_feature_flag_defaults_cover_previously_invisible_keys(client):
    fetched = client.get("/api/admin/feature-flags")
    assert fetched.status_code == 200
    keys = {item["key"] for item in fetched.json()["items"]}
    for expected in ("whiteboard", "files", "meeting_notes", "diagnostics", "stt", "tts", "blogs", "payments", "invitations", "moderator_controls", "breakout_rooms", "reactions"):
        assert expected in keys, f"{expected} should now be admin-editable"


def test_wired_flags_can_be_toggled_and_persist(client):
    flags = client.get("/api/admin/feature-flags").json()["items"]
    whiteboard = next(item for item in flags if item["key"] == "whiteboard")
    response = client.patch(f"/api/admin/feature-flags/{whiteboard['_id']}", json={"enabled": False})
    assert response.status_code == 200
    assert response.json()["enabled"] is False
