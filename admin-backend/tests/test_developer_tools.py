"""Tests for the Developer Tools module's webhook subscriber CRUD (P1
hardening item: ADMIN_IMPLEMENTATION_PLAN.md Phase 12 item 1). Writes
directly to the `webhooks` collection the public backend's WebhookManager
already dispatches from -- see routers/developer.py's module docstring for
why (separate FastAPI app/process, can't import WebhookManager directly).
"""

from bson import ObjectId


def test_create_webhook_returns_the_secret_once(client):
    response = client.post("/api/admin/developer/webhooks", json={
        "url": "https://example.com/hooks/voxo",
        "secret": "a-sufficiently-long-signing-secret",
        "events": ["meeting.started", "Meeting.Ended"],
    })
    assert response.status_code == 201
    body = response.json()["webhook"]
    assert body["url"] == "https://example.com/hooks/voxo"
    assert body["events"] == ["meeting.started", "meeting.ended"]
    assert body["secret"] == "a-sufficiently-long-signing-secret"
    assert body["enabled"] is True


def test_create_webhook_rejects_non_http_url(client):
    response = client.post("/api/admin/developer/webhooks", json={
        "url": "ftp://example.com/hook",
        "secret": "a-sufficiently-long-signing-secret",
        "events": ["meeting.started"],
    })
    assert response.status_code == 422


def test_list_webhooks_never_returns_the_secret(client):
    client.post("/api/admin/developer/webhooks", json={
        "url": "https://example.com/hooks/voxo",
        "secret": "a-sufficiently-long-signing-secret",
        "events": ["meeting.started"],
    })
    response = client.get("/api/admin/developer/webhooks")
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 1
    assert "secret" not in items[0]
    assert items[0]["secret_configured"] is True


def test_create_webhook_is_audit_logged(client):
    client.post("/api/admin/developer/webhooks", json={
        "url": "https://example.com/hooks/voxo",
        "secret": "a-sufficiently-long-signing-secret",
        "events": ["meeting.started"],
    })
    logs = client.get("/api/admin/logs", params={"limit": 50}).json()["items"]
    assert any(entry["action"] == "webhook.create" for entry in logs)


def test_update_webhook_can_disable_it(client):
    created = client.post("/api/admin/developer/webhooks", json={
        "url": "https://example.com/hooks/voxo",
        "secret": "a-sufficiently-long-signing-secret",
        "events": ["meeting.started"],
    }).json()["webhook"]

    response = client.patch(f"/api/admin/developer/webhooks/{created['_id']}", json={"enabled": False})
    assert response.status_code == 200
    assert response.json()["webhook"]["enabled"] is False


def test_update_nonexistent_webhook_returns_404(client):
    response = client.patch(f"/api/admin/developer/webhooks/{ObjectId()}", json={"enabled": False})
    assert response.status_code == 404


def test_update_webhook_invalid_id_returns_400(client):
    response = client.patch("/api/admin/developer/webhooks/not-an-object-id", json={"enabled": False})
    assert response.status_code == 400


def test_delete_webhook_removes_it(client):
    created = client.post("/api/admin/developer/webhooks", json={
        "url": "https://example.com/hooks/voxo",
        "secret": "a-sufficiently-long-signing-secret",
        "events": ["meeting.started"],
    }).json()["webhook"]

    response = client.delete(f"/api/admin/developer/webhooks/{created['_id']}")
    assert response.status_code == 200

    remaining = client.get("/api/admin/developer/webhooks").json()["items"]
    assert remaining == []


def test_delete_nonexistent_webhook_returns_404(client):
    response = client.delete(f"/api/admin/developer/webhooks/{ObjectId()}")
    assert response.status_code == 404


def test_webhook_routes_require_developer_permissions(client):
    from app import security
    from app.main import app as fastapi_app

    async def _zero_permission_admin():
        return {"_id": ObjectId(), "email": "zero@test.local", "admin_permissions": []}

    fastapi_app.dependency_overrides[security.require_admin] = _zero_permission_admin
    assert client.get("/api/admin/developer/webhooks").status_code == 403
    assert client.post("/api/admin/developer/webhooks", json={
        "url": "https://example.com/hook", "secret": "a-sufficiently-long-signing-secret", "events": ["x"],
    }).status_code == 403


def test_all_admin_permissions_includes_developer_scopes():
    from app.security import ALL_ADMIN_PERMISSIONS
    assert "developer.read" in ALL_ADMIN_PERMISSIONS
    assert "developer.write" in ALL_ADMIN_PERMISSIONS
