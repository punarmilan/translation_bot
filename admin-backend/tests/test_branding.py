"""Regression tests for Phase 7: Branding CMS persistence, retrieval,
fallback defaults, and permission enforcement on
GET/PATCH /api/admin/settings/branding.

update_branding_settings() fires a best-effort HTTP notify to the public
backend's /api/internal/reload-config on every save (silently swallowed on
failure) -- httpx.AsyncClient.post is patched out here so these tests don't
depend on a real backend listening on port 8000.
"""

from unittest.mock import AsyncMock, patch

import httpx

EXPECTED_DEFAULT_KEYS = {
    "product_name", "site_title", "logo_url", "logo_dark_url", "favicon_url",
    "favicon_dark_url", "og_image", "twitter_card", "meta_description",
    "seo_keywords", "accent_color", "primary_color", "secondary_color",
    "font_family", "heading_font_family", "border_radius", "button_style",
    "footer_text", "copyright_text", "company_name", "company_email",
    "company_website", "social_twitter", "social_linkedin", "social_github",
    "social_youtube",
}


def test_branding_defaults_are_returned_when_no_document_exists(client):
    response = client.get("/api/admin/settings/branding")
    assert response.status_code == 200
    body = response.json()
    assert body["key"] == "branding"
    values = body["values"]
    assert EXPECTED_DEFAULT_KEYS.issubset(values.keys())
    assert values["product_name"] == "VOXO"
    assert values["company_website"] == ""


def test_branding_patch_persists_and_round_trips(client):
    payload = {
        "product_name": "Acme Meet",
        "site_title": "Acme Meet — Talk To Anyone",
        "logo_url": "/images/acme-logo.png",
        "logo_dark_url": "/images/acme-logo-dark.png",
        "favicon_url": "/favicon-acme.ico",
        "favicon_dark_url": "/favicon-acme-dark.ico",
        "company_name": "Acme Corp",
        "company_email": "hello@acme.example",
        "company_website": "acme.example",
        "social_twitter": "https://x.com/acme",
        "primary_color": "#101010",
        "secondary_color": "#202020",
    }
    with patch.object(httpx.AsyncClient, "post", new=AsyncMock(side_effect=httpx.ConnectError("refused"))):
        saved = client.patch("/api/admin/settings/branding", json={"values": payload})
    assert saved.status_code == 200

    fetched = client.get("/api/admin/settings/branding")
    assert fetched.status_code == 200
    values = fetched.json()["values"]
    for key, expected in payload.items():
        assert values[key] == expected


def test_branding_patch_survives_reload_config_notify_failure(client):
    # The best-effort notify to the public backend must never make a save fail.
    payload = {"product_name": "Still Saved"}
    with patch.object(httpx.AsyncClient, "post", new=AsyncMock(side_effect=httpx.ConnectError("refused"))):
        response = client.patch("/api/admin/settings/branding", json={"values": payload})
    assert response.status_code == 200
    assert client.get("/api/admin/settings/branding").json()["values"]["product_name"] == "Still Saved"


def test_branding_get_requires_settings_read_permission(client):
    from bson import ObjectId
    from app import security
    from app.main import app as fastapi_app

    async def _limited_admin():
        return {"_id": ObjectId(), "email": "limited@test.local", "admin_permissions": ["dashboard.read"]}

    fastapi_app.dependency_overrides[security.require_admin] = _limited_admin
    response = client.get("/api/admin/settings/branding")
    assert response.status_code == 403


def test_branding_patch_requires_settings_write_permission_not_just_read(client):
    from bson import ObjectId
    from app import security
    from app.main import app as fastapi_app

    async def _read_only_admin():
        return {"_id": ObjectId(), "email": "readonly@test.local", "admin_permissions": ["settings.read"]}

    fastapi_app.dependency_overrides[security.require_admin] = _read_only_admin
    response = client.patch("/api/admin/settings/branding", json={"values": {"product_name": "Should Not Save"}})
    assert response.status_code == 403
