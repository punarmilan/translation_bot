"""Regression tests for Phase 10's Organizations completeness work
(admin-backend/app/routers/enterprise.py): PATCH (previously create+read
only), audit logging on create/update, membership assignment via the
existing user-update endpoint (reused rather than duplicated), and domain
uniqueness on update.
"""


def test_create_organization_with_branding(client):
    response = client.post("/api/admin/enterprise/organizations", json={
        "name": "Acme Corp",
        "domain": "acme.com",
        "branding": {"primary_color": "#112233", "logo_url": "https://acme.example/logo.png", "custom_footer": "Powered by Acme"},
    })
    assert response.status_code == 200
    org = response.json()["organization"]
    assert org["name"] == "Acme Corp"
    assert org["domain"] == "acme.com"
    assert org["branding"]["primary_color"] == "#112233"
    assert org["enabled"] is True


def test_create_organization_is_audit_logged(client):
    client.post("/api/admin/enterprise/organizations", json={"name": "Globex", "domain": "globex.com"})
    logs = client.get("/api/admin/logs", params={"limit": 50}).json()["items"]
    assert any(entry["action"] == "organization.create" for entry in logs)


def test_update_organization_name_domain_branding_and_status(client):
    created = client.post("/api/admin/enterprise/organizations", json={"name": "Initech", "domain": "initech.com"}).json()["organization"]
    org_id = created["_id"]

    updated = client.patch(f"/api/admin/enterprise/organizations/{org_id}", json={
        "name": "Initech LLC",
        "enabled": False,
        "branding": {"primary_color": "#ff0000"},
    })
    assert updated.status_code == 200
    body = updated.json()["organization"]
    assert body["name"] == "Initech LLC"
    assert body["enabled"] is False
    assert body["branding"]["primary_color"] == "#ff0000"
    # domain untouched since it wasn't part of this PATCH
    assert body["domain"] == "initech.com"


def test_update_organization_is_audit_logged(client):
    created = client.post("/api/admin/enterprise/organizations", json={"name": "Umbrella", "domain": "umbrella.com"}).json()["organization"]
    client.patch(f"/api/admin/enterprise/organizations/{created['_id']}", json={"enabled": False})
    logs = client.get("/api/admin/logs", params={"limit": 50}).json()["items"]
    assert any(entry["action"] == "organization.update" for entry in logs)


def test_update_organization_rejects_duplicate_domain(client):
    client.post("/api/admin/enterprise/organizations", json={"name": "Org A", "domain": "org-a.com"})
    org_b = client.post("/api/admin/enterprise/organizations", json={"name": "Org B", "domain": "org-b.com"}).json()["organization"]

    response = client.patch(f"/api/admin/enterprise/organizations/{org_b['_id']}", json={"domain": "org-a.com"})
    assert response.status_code == 400


def test_update_nonexistent_organization_returns_404(client):
    from bson import ObjectId
    response = client.patch(f"/api/admin/enterprise/organizations/{ObjectId()}", json={"name": "Ghost"})
    assert response.status_code == 404


def test_update_organization_invalid_id_returns_400(client):
    response = client.patch("/api/admin/enterprise/organizations/not-an-object-id", json={"name": "New Name"})
    assert response.status_code == 400


def test_assign_member_via_existing_user_update_endpoint(client):
    org = client.post("/api/admin/enterprise/organizations", json={"name": "Wayne Enterprises", "domain": "wayne.com"}).json()["organization"]
    user = client.post("/api/admin/users", json={
        "name": "Bruce Wayne", "email": "bruce@wayne.com", "password": "batcave123", "role": "participant",
    }).json()

    patched = client.patch(f"/api/admin/users/{user['user_id']}", json={"org_id": org["_id"]})
    assert patched.status_code == 200
    assert patched.json()["org_id"] == org["_id"]

    members = client.get(f"/api/admin/enterprise/organizations/{org['_id']}/users").json()
    assert any(u["email"] == "bruce@wayne.com" for u in members["users"])


def test_organizations_routes_require_permission(client):
    from bson import ObjectId
    from app import security
    from app.main import app as fastapi_app

    async def _no_enterprise_admin():
        return {"_id": ObjectId(), "email": "limited@test.local", "admin_permissions": ["dashboard.read"]}

    fastapi_app.dependency_overrides[security.require_admin] = _no_enterprise_admin
    assert client.get("/api/admin/enterprise/organizations").status_code == 403
    assert client.post("/api/admin/enterprise/organizations", json={"name": "X", "domain": "x.com"}).status_code == 403
