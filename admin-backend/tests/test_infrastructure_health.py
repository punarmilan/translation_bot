"""Regression tests for the live Infrastructure health-check endpoint.

Status values (healthy/unavailable/not_configured) depend on whether the
public backend, LibreTranslate, and coturn are actually reachable from the
machine running the tests -- so these tests assert response *shape* and
permission enforcement, not specific live statuses.
"""


def test_infrastructure_health_reports_every_checkable_dependency(client):
    response = client.get("/api/admin/infrastructure/health")
    assert response.status_code == 200
    body = response.json()

    checked_names = {item["name"] for item in body["checked"]}
    assert checked_names == {"MongoDB", "coturn (TURN/STUN)", "LibreTranslate", "Whisper (STT)", "Piper (TTS)"}
    for item in body["checked"]:
        assert "status" in item

    not_inspectable_names = {item["name"] for item in body["not_inspectable"]}
    assert not_inspectable_names == {"Docker daemon", "Caddy"}
    for item in body["not_inspectable"]:
        assert item["detail"]


def test_infrastructure_health_mongo_check_is_actually_live(client):
    # mongomock backs get_db() in this test environment, so the MongoDB
    # entry should always report healthy -- this is the one dependency the
    # test suite can genuinely exercise end to end without a real network call.
    body = client.get("/api/admin/infrastructure/health").json()
    mongo = next(item for item in body["checked"] if item["name"] == "MongoDB")
    assert mongo["status"] == "healthy"
    assert mongo["latency_ms"] is not None


def test_infrastructure_health_requires_system_read_permission(client):
    from bson import ObjectId
    from app import security
    from app.main import app as fastapi_app

    async def _limited_admin():
        return {"_id": ObjectId(), "email": "limited@test.local", "admin_permissions": ["dashboard.read"]}

    fastapi_app.dependency_overrides[security.require_admin] = _limited_admin
    response = client.get("/api/admin/infrastructure/health")
    assert response.status_code == 403
