"""Tests for the Security module (P0 hardening item): read-only session/
cookie/rate-limit policy visibility plus active admin-session listing and
revocation, per ADMIN_IMPLEMENTATION_PLAN.md's Phase 11 scope ("Read-only
first ... session lifetime and rate-limit thresholds become editable only
after the read-only version has been in use").

Also covers the accompanying `_sync_administrator_role_permissions`
migration in app/main.py, added because adding new permission strings to
ALL_ADMIN_PERMISSIONS (as this pass did for security.read/security.write)
does not retroactively reach already-registered admins whose
`admin_permissions` was snapshotted at account-creation time -- the exact
bug class Phase 10 fixed for enterprise.read/enterprise.write.
"""

from datetime import datetime, timedelta, timezone

from bson import ObjectId

from app.repositories.session_repository import AdminSessionRepository
from app.security import ALL_ADMIN_PERMISSIONS


def test_all_admin_permissions_includes_security_scopes():
    assert "security.read" in ALL_ADMIN_PERMISSIONS
    assert "security.write" in ALL_ADMIN_PERMISSIONS


def test_policy_endpoint_returns_expected_shape(client):
    response = client.get("/api/admin/security/policy")
    assert response.status_code == 200
    body = response.json()
    assert "access_token_expire_minutes" in body["session"]
    assert "refresh_token_expire_days" in body["session"]
    assert body["cookies"]["samesite"]
    assert body["login_rate_limit"]["distributed"] is False
    assert body["login_rate_limit"]["max_failed_attempts"] > 0


def test_policy_requires_security_read_permission(client):
    from app import security
    from app.main import app as fastapi_app

    async def _zero_permission_admin():
        return {"_id": ObjectId(), "email": "zero@test.local", "admin_permissions": []}

    fastapi_app.dependency_overrides[security.require_admin] = _zero_permission_admin
    response = client.get("/api/admin/security/policy")
    assert response.status_code == 403


async def _seed_session(db, *, admin_id: str, revoked: bool = False, expired: bool = False) -> str:
    repo = AdminSessionRepository(db)
    session_id = f"session-{ObjectId()}"
    expires_at = datetime.now(timezone.utc) + (timedelta(minutes=-5) if expired else timedelta(days=7))
    await repo.create(
        admin_id=admin_id,
        session_id=session_id,
        refresh_fingerprint="fingerprint-" + session_id,
        expires_at=expires_at,
        ip_address="203.0.113.5",
        user_agent="pytest",
    )
    if revoked:
        await repo.revoke(session_id, "test_setup")
    return session_id


async def test_sessions_list_only_returns_active_sessions(client):
    from app.database import get_db

    db = get_db()
    admin_id = str(ObjectId())
    await db["users"].insert_one({"_id": ObjectId(admin_id), "name": "Ada Admin", "email": "ada-admin@example.com"})

    active_id = await _seed_session(db, admin_id=admin_id)
    await _seed_session(db, admin_id=admin_id, revoked=True)
    await _seed_session(db, admin_id=admin_id, expired=True)

    response = client.get("/api/admin/security/sessions")
    assert response.status_code == 200
    items = response.json()["items"]
    session_ids = {item["session_id"] for item in items}
    assert session_ids == {active_id}
    assert items[0]["admin_name"] == "Ada Admin"
    assert items[0]["admin_email"] == "ada-admin@example.com"


async def test_revoke_session_marks_it_revoked_and_audit_logs(client):
    from app.database import get_db

    db = get_db()
    admin_id = str(ObjectId())
    session_id = await _seed_session(db, admin_id=admin_id)

    response = client.delete(f"/api/admin/security/sessions/{session_id}")
    assert response.status_code == 200

    remaining = client.get("/api/admin/security/sessions").json()["items"]
    assert session_id not in {item["session_id"] for item in remaining}

    logs = client.get("/api/admin/logs", params={"limit": 50}).json()["items"]
    assert any(entry["action"] == "admin_session.revoke" and entry["target_id"] == session_id for entry in logs)


def test_revoke_nonexistent_session_returns_404(client):
    response = client.delete("/api/admin/security/sessions/does-not-exist")
    assert response.status_code == 404


async def test_revoke_already_revoked_session_returns_400(client):
    from app.database import get_db

    db = get_db()
    admin_id = str(ObjectId())
    session_id = await _seed_session(db, admin_id=admin_id, revoked=True)

    response = client.delete(f"/api/admin/security/sessions/{session_id}")
    assert response.status_code == 400


def test_sessions_and_revoke_require_security_permissions(client):
    from app import security
    from app.main import app as fastapi_app

    async def _zero_permission_admin():
        return {"_id": ObjectId(), "email": "zero@test.local", "admin_permissions": []}

    fastapi_app.dependency_overrides[security.require_admin] = _zero_permission_admin
    assert client.get("/api/admin/security/sessions").status_code == 403
    assert client.delete("/api/admin/security/sessions/whatever").status_code == 403


async def test_sync_administrator_role_permissions_migration(client):
    from app.database import get_db
    from app.main import _sync_administrator_role_permissions

    db = get_db()
    stale_permissions = ["dashboard.read"]
    await db["admin_roles"].update_one(
        {"key": "administrator"},
        {"$set": {"key": "administrator", "permissions": stale_permissions}},
        upsert=True,
    )
    admin_user = {
        "_id": ObjectId(),
        "role": "admin",
        "admin_role": "administrator",
        "admin_permissions": stale_permissions,
    }
    await db["users"].insert_one(admin_user)

    await _sync_administrator_role_permissions(db)

    role = await db["admin_roles"].find_one({"key": "administrator"})
    assert set(role["permissions"]) == ALL_ADMIN_PERMISSIONS

    refreshed_user = await db["users"].find_one({"_id": admin_user["_id"]})
    assert set(refreshed_user["admin_permissions"]) == ALL_ADMIN_PERMISSIONS
