"""Regression tests for Phase 10 findings in app/security.py:

1. enterprise.read/enterprise.write were missing from ALL_ADMIN_PERMISSIONS,
   so every admin -- including the "Administrator" system role, whose
   permission list is `sorted(ALL_ADMIN_PERMISSIONS)` -- got 403 on every
   Organizations route regardless of role.
2. require_permission()/public_admin() used `admin_permissions or ALL...`,
   which treats an explicitly-empty list [] (meant as "zero permissions")
   the same as a missing field, silently granting full access instead of
   none.
"""

from bson import ObjectId

from app.security import ALL_ADMIN_PERMISSIONS, public_admin


def test_all_admin_permissions_includes_enterprise_scopes():
    assert "enterprise.read" in ALL_ADMIN_PERMISSIONS
    assert "enterprise.write" in ALL_ADMIN_PERMISSIONS


def test_administrator_role_can_reach_organizations_routes(client):
    # The "Administrator" system role is seeded as sorted(ALL_ADMIN_PERMISSIONS)
    # (see platform.py's list_roles) -- assign it explicitly to prove the
    # permission set itself (not just the test fixture's None-means-everything
    # fallback) actually includes enterprise.* now.
    from app import security
    from app.main import app as fastapi_app

    async def _administrator_admin():
        return {"_id": ObjectId(), "email": "administrator@test.local", "admin_permissions": sorted(ALL_ADMIN_PERMISSIONS)}

    fastapi_app.dependency_overrides[security.require_admin] = _administrator_admin
    response = client.get("/api/admin/enterprise/organizations")
    assert response.status_code == 200


def test_empty_permissions_list_grants_nothing(client):
    from app import security
    from app.main import app as fastapi_app

    async def _no_permissions_admin():
        return {"_id": ObjectId(), "email": "zero@test.local", "admin_permissions": []}

    fastapi_app.dependency_overrides[security.require_admin] = _no_permissions_admin
    response = client.get("/api/admin/users")
    assert response.status_code == 403


def test_missing_permissions_field_still_grants_everything_for_backward_compat(client):
    from app import security
    from app.main import app as fastapi_app

    async def _legacy_admin():
        return {"_id": ObjectId(), "email": "legacy@test.local", "admin_permissions": None}

    fastapi_app.dependency_overrides[security.require_admin] = _legacy_admin
    response = client.get("/api/admin/users")
    assert response.status_code == 200


def test_public_admin_reflects_empty_permissions_honestly():
    user = {"_id": ObjectId(), "email": "zero@test.local", "admin_permissions": []}
    assert public_admin(user)["permissions"] == []


def test_public_admin_falls_back_to_all_when_field_missing():
    user = {"_id": ObjectId(), "email": "legacy@test.local"}
    assert public_admin(user)["permissions"] == sorted(ALL_ADMIN_PERMISSIONS)
