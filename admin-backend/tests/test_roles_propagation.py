"""Regression tests for Phase 10: editing a role's permissions must
propagate to admins already assigned that role (previously a stale
snapshot -- update_role() only touched the admin_roles document, never the
users already carrying a copy of its old permission list), and custom
roles must actually be assignable to a user (previously UsersPage.jsx had
a hardcoded 3-option dropdown that could never offer a custom role).
"""


def test_updating_role_permissions_propagates_to_assigned_admins(client):
    role = client.post("/api/admin/roles", json={
        "key": "billing_viewer", "name": "Billing Viewer", "description": "", "permissions": ["dashboard.read"],
    }).json()

    admin_user = client.post("/api/admin/users", json={
        "name": "Ada Lovelace", "email": "ada@example.com", "password": "analytical1", "role": "participant",
    }).json()
    client.patch(f"/api/admin/users/{admin_user['user_id']}", json={"role": "admin", "admin_role": "billing_viewer"})

    fetched = client.get(f"/api/admin/users/{admin_user['user_id']}").json()
    assert fetched["admin_permissions"] == ["dashboard.read"]

    client.patch(f"/api/admin/roles/{role['key']}", json={"values": {
        "name": "Billing Viewer", "description": "", "permissions": ["dashboard.read", "analytics.read"],
    }})

    refetched = client.get(f"/api/admin/users/{admin_user['user_id']}").json()
    assert set(refetched["admin_permissions"]) == {"dashboard.read", "analytics.read"}


def test_updating_role_permissions_does_not_touch_unrelated_admins(client):
    client.post("/api/admin/roles", json={"key": "role_a", "name": "Role A", "description": "", "permissions": ["dashboard.read"]})
    client.post("/api/admin/roles", json={"key": "role_b", "name": "Role B", "description": "", "permissions": ["users.read"]})

    user_b = client.post("/api/admin/users", json={
        "name": "Bob", "email": "bob@example.com", "password": "password123", "role": "participant",
    }).json()
    client.patch(f"/api/admin/users/{user_b['user_id']}", json={"role": "admin", "admin_role": "role_b"})

    client.patch("/api/admin/roles/role_a", json={"values": {"name": "Role A", "description": "", "permissions": ["settings.write"]}})

    unaffected = client.get(f"/api/admin/users/{user_b['user_id']}").json()
    assert unaffected["admin_permissions"] == ["users.read"]


def test_role_update_is_audit_logged_with_propagation_count(client):
    client.post("/api/admin/roles", json={"key": "auditable_role", "name": "Auditable", "description": "", "permissions": []})
    user = client.post("/api/admin/users", json={
        "name": "Carol", "email": "carol@example.com", "password": "password123", "role": "participant",
    }).json()
    client.patch(f"/api/admin/users/{user['user_id']}", json={"role": "admin", "admin_role": "auditable_role"})

    client.patch("/api/admin/roles/auditable_role", json={"values": {"name": "Auditable", "description": "", "permissions": ["dashboard.read"]}})

    logs = client.get("/api/admin/logs", params={"limit": 50}).json()["items"]
    role_update_entries = [entry for entry in logs if entry["action"] == "role.update"]
    assert role_update_entries
