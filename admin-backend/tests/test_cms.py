"""Regression tests for the Phase 1 generic CMS foundation: page CRUD,
draft/publish/revert lifecycle, versioning, and the public-only-sees-published
guarantee. These exercise the actual HTTP routes (admin-backend/app/routers/cms.py)
against an in-memory MongoDB, not just the repository in isolation, so a
regression in wiring (permissions, serialization, status codes) is caught too.
"""

import jwt

from app.config import get_settings


def create_page(client, page="features", label="Features"):
    return client.post("/api/admin/cms/pages", json={"page": page, "label": label})


def test_section_types_are_exposed(client):
    response = client.get("/api/admin/cms/section-types")
    assert response.status_code == 200
    keys = {item["key"] for item in response.json()["items"]}
    assert {"hero", "faq", "cta", "testimonials", "feature_grid", "richtext", "custom"} <= keys


def test_create_page_then_list_and_get(client):
    created = create_page(client)
    assert created.status_code == 201
    body = created.json()
    assert body["page"] == "features"
    assert body["version"] == 0
    assert body["published"] is None

    listed = client.get("/api/admin/cms/pages")
    assert listed.status_code == 200
    pages = {item["page"]: item for item in listed.json()["items"]}
    # "landing" is auto-migrated at startup (see app/cms/migrate_landing.py);
    # every other test in this module only cares about the page it creates.
    assert "landing" in pages
    assert pages["features"]["status"] == "draft"
    assert pages["features"]["section_count"] == 0

    fetched = client.get("/api/admin/cms/pages/features")
    assert fetched.status_code == 200
    assert fetched.json()["status"] == "draft"


def test_create_page_duplicate_key_is_rejected(client):
    create_page(client)
    duplicate = create_page(client)
    assert duplicate.status_code == 409


def test_get_missing_page_is_404(client):
    response = client.get("/api/admin/cms/pages/does-not-exist")
    assert response.status_code == 404


def test_add_section_uses_registry_defaults(client):
    create_page(client)
    response = client.post("/api/admin/cms/pages/features/sections", json={"type": "hero", "name": "Top banner"})
    assert response.status_code == 201
    sections = response.json()["draft"]["sections"]
    assert len(sections) == 1
    assert sections[0]["type"] == "hero"
    assert sections[0]["name"] == "Top banner"
    assert sections[0]["cards"] == []
    # Every declared field for the "hero" type should be present with its default.
    assert "cta_text" in sections[0]
    assert "image_url" in sections[0]


def test_add_section_with_unknown_type_is_rejected(client):
    create_page(client)
    response = client.post("/api/admin/cms/pages/features/sections", json={"type": "not-a-real-type", "name": "x"})
    assert response.status_code == 400


def test_save_draft_replaces_sections_and_reports_draft_status(client):
    create_page(client)
    sections = [{"key": "sec_1", "type": "richtext", "name": "Intro", "hidden": False, "eyebrow": "Hi", "title": "T", "body": "B", "cards": []}]
    response = client.put("/api/admin/cms/pages/features", json={"sections": sections})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "draft"
    assert body["draft"]["sections"] == sections
    assert body["published"] is None


def test_publish_snapshots_draft_and_increments_version(client):
    create_page(client)
    sections = [{"key": "sec_1", "type": "richtext", "name": "Intro", "hidden": False, "title": "V1", "cards": []}]
    client.put("/api/admin/cms/pages/features", json={"sections": sections})

    published = client.post("/api/admin/cms/pages/features/publish")
    assert published.status_code == 200
    body = published.json()
    assert body["version"] == 1
    assert body["status"] == "published"
    assert body["published"]["sections"] == sections
    assert body["published"]["version"] == 1

    # Publishing again with unchanged content bumps the version again --
    # every publish is a durable, numbered snapshot.
    republished = client.post("/api/admin/cms/pages/features/publish")
    assert republished.json()["version"] == 2

    versions = client.get("/api/admin/cms/pages/features/versions")
    assert versions.status_code == 200
    version_numbers = [v["version"] for v in versions.json()["items"]]
    assert version_numbers == [2, 1]


def test_status_is_modified_after_publish_then_further_draft_edits(client):
    create_page(client)
    sections = [{"key": "sec_1", "type": "richtext", "name": "Intro", "hidden": False, "title": "V1", "cards": []}]
    client.put("/api/admin/cms/pages/features", json={"sections": sections})
    client.post("/api/admin/cms/pages/features/publish")

    changed_sections = [{"key": "sec_1", "type": "richtext", "name": "Intro", "hidden": False, "title": "V2 (unpublished edit)", "cards": []}]
    response = client.put("/api/admin/cms/pages/features", json={"sections": changed_sections})
    assert response.json()["status"] == "modified"

    listed = client.get("/api/admin/cms/pages").json()["items"]
    assert listed[0]["status"] == "modified"


def test_revert_discards_unpublished_draft_edits(client):
    create_page(client)
    published_sections = [{"key": "sec_1", "type": "richtext", "name": "Intro", "hidden": False, "title": "Published copy", "cards": []}]
    client.put("/api/admin/cms/pages/features", json={"sections": published_sections})
    client.post("/api/admin/cms/pages/features/publish")

    client.put("/api/admin/cms/pages/features", json={"sections": [{"key": "sec_1", "type": "richtext", "name": "Intro", "hidden": False, "title": "Unsaved draft edit", "cards": []}]})

    reverted = client.post("/api/admin/cms/pages/features/revert")
    assert reverted.status_code == 200
    body = reverted.json()
    assert body["status"] == "published"
    assert body["draft"]["sections"] == published_sections


def test_public_endpoint_404s_until_first_publish(client):
    create_page(client)
    client.put("/api/admin/cms/pages/features", json={"sections": [{"key": "sec_1", "type": "richtext", "name": "Intro", "hidden": False, "title": "Draft only", "cards": []}]})

    public_before = client.get("/api/public/cms/pages/features")
    assert public_before.status_code == 404

    client.post("/api/admin/cms/pages/features/publish")
    public_after = client.get("/api/public/cms/pages/features")
    assert public_after.status_code == 200
    assert public_after.json()["sections"][0]["title"] == "Draft only"


def test_public_endpoint_never_leaks_unpublished_draft_edits(client):
    create_page(client)
    client.put("/api/admin/cms/pages/features", json={"sections": [{"key": "sec_1", "type": "richtext", "name": "Intro", "hidden": False, "title": "Published title", "cards": []}]})
    client.post("/api/admin/cms/pages/features/publish")

    client.put("/api/admin/cms/pages/features", json={"sections": [{"key": "sec_1", "type": "richtext", "name": "Intro", "hidden": False, "title": "Not yet live", "cards": []}]})

    public = client.get("/api/public/cms/pages/features")
    assert public.status_code == 200
    assert public.json()["sections"][0]["title"] == "Published title"


def test_public_endpoint_hides_hidden_sections(client):
    create_page(client)
    sections = [
        {"key": "sec_visible", "type": "richtext", "name": "Visible", "hidden": False, "title": "Shown", "cards": []},
        {"key": "sec_hidden", "type": "richtext", "name": "Hidden", "hidden": True, "title": "Not shown", "cards": []},
    ]
    client.put("/api/admin/cms/pages/features", json={"sections": sections})
    client.post("/api/admin/cms/pages/features/publish")

    public = client.get("/api/public/cms/pages/features")
    titles = [s["title"] for s in public.json()["sections"]]
    assert titles == ["Shown"]


def test_delete_page_removes_it_and_its_versions(client):
    create_page(client)
    client.post("/api/admin/cms/pages/features/publish")
    deleted = client.delete("/api/admin/cms/pages/features")
    assert deleted.status_code == 200
    assert client.get("/api/admin/cms/pages/features").status_code == 404
    assert client.get("/api/admin/cms/pages/features/versions").json()["items"] == []


def test_missing_permission_is_rejected(client):
    from bson import ObjectId
    from app import security
    from app.main import app as fastapi_app

    async def _forbidden_admin():
        return {"_id": ObjectId(), "email": "limited@test.local", "admin_permissions": ["dashboard.read"]}

    # Fixture teardown clears all dependency_overrides after the test, so this
    # override does not need to be manually restored.
    fastapi_app.dependency_overrides[security.require_admin] = _forbidden_admin
    response = client.post("/api/admin/cms/pages", json={"page": "pricing", "label": "Pricing"})
    assert response.status_code == 403


def test_preview_token_mint_is_scoped_to_the_page_and_short_lived(client):
    create_page(client)
    response = client.post("/api/admin/cms/pages/features/preview-token")
    assert response.status_code == 200
    body = response.json()
    assert body["expires_in"] > 0

    settings = get_settings()
    claims = jwt.decode(body["token"], settings.CMS_PREVIEW_SECRET, algorithms=["HS256"])
    assert claims["page"] == "features"
    assert claims["purpose"] == "cms_preview"
    assert claims["exp"] - claims["iat"] == body["expires_in"]


def test_preview_token_mint_404s_for_unknown_page(client):
    response = client.post("/api/admin/cms/pages/does-not-exist/preview-token")
    assert response.status_code == 404


def test_section_types_include_new_landing_types_with_expected_shape(client):
    response = client.get("/api/admin/cms/section-types")
    by_key = {item["key"]: item for item in response.json()["items"]}

    statistics = by_key["statistics"]
    assert statistics["supports_cards"] is True
    assert {f["key"] for f in statistics["card_fields"]} == {"value", "label", "icon"}

    trusted_by = by_key["trusted_by"]
    assert trusted_by["supports_cards"] is True
    assert {f["key"] for f in trusted_by["card_fields"]} == {"name", "logo_url", "link_url"}

    footer_cta = by_key["footer_cta"]
    assert footer_cta["supports_cards"] is False
    assert {f["key"] for f in footer_cta["fields"]} >= {"title", "body", "cta_text", "cta_link"}

    # "cta" remains its own separate type -- footer_cta is additive, not a replacement.
    assert "cta" in by_key


def test_new_section_types_default_to_zero_cards(client):
    create_page(client, page="new-sections-page")
    for type_key in ("statistics", "trusted_by"):
        response = client.post(
            "/api/admin/cms/pages/new-sections-page/sections",
            json={"type": type_key, "name": f"New {type_key}"},
        )
        assert response.status_code == 201
        sections = response.json()["draft"]["sections"]
        added = next(s for s in sections if s["type"] == type_key)
        # No fabricated placeholder stats/logos ship by default -- an admin
        # must add real cards before publishing.
        assert added["cards"] == []


def test_body_fields_are_now_richtext_type(client):
    response = client.get("/api/admin/cms/section-types")
    hero = next(item for item in response.json()["items"] if item["key"] == "hero")
    body_field = next(f for f in hero["fields"] if f["key"] == "body")
    assert body_field["type"] == "richtext"


def test_save_draft_sanitizes_richtext_fields(client):
    create_page(client, page="sanitize-page")
    sections = [{
        "key": "sec_1", "type": "hero", "name": "Hero", "hidden": False,
        "title": "T", "body": "<p>ok</p><script>alert(1)</script>", "cards": [],
    }]
    response = client.put("/api/admin/cms/pages/sanitize-page", json={"sections": sections})
    assert response.status_code == 200
    saved_body = response.json()["draft"]["sections"][0]["body"]
    assert "script" not in saved_body
    assert "<p>ok</p>" in saved_body


def test_seo_metadata_round_trips_through_draft_and_publish(client):
    create_page(client, page="seo-page")
    payload = {
        "sections": [],
        "seo": {"meta_title": "Custom Title", "meta_description": "Custom description", "og_image_url": "/media/og.png"},
    }
    saved = client.put("/api/admin/cms/pages/seo-page", json=payload)
    assert saved.status_code == 200
    assert saved.json()["draft"]["seo"]["meta_title"] == "Custom Title"

    published = client.post("/api/admin/cms/pages/seo-page/publish")
    assert published.json()["published"]["seo"]["meta_title"] == "Custom Title"

    public = client.get("/api/public/cms/pages/seo-page")
    assert public.json()["seo"]["meta_title"] == "Custom Title"
    assert public.json()["seo"]["og_image_url"] == "/media/og.png"


def test_seo_metadata_persists_across_add_section_calls(client):
    create_page(client, page="seo-persist-page")
    client.put(
        "/api/admin/cms/pages/seo-persist-page",
        json={"sections": [], "seo": {"meta_title": "Keep me", "meta_description": "", "og_image_url": ""}},
    )
    updated = client.post(
        "/api/admin/cms/pages/seo-persist-page/sections",
        json={"type": "richtext", "name": "Intro"},
    )
    assert updated.json()["draft"]["seo"]["meta_title"] == "Keep me"


def test_scheduled_publish_at_round_trips_and_clears_on_revert(client):
    create_page(client, page="schedule-page")
    future = "2030-01-01T00:00:00+00:00"
    client.put(
        "/api/admin/cms/pages/schedule-page",
        json={"sections": [{"key": "sec_1", "type": "richtext", "name": "Intro", "hidden": False, "title": "T", "cards": []}], "scheduled_publish_at": future},
    )
    fetched = client.get("/api/admin/cms/pages/schedule-page")
    assert fetched.json()["draft"]["scheduled_publish_at"] is not None

    client.post("/api/admin/cms/pages/schedule-page/publish")
    reverted = client.post("/api/admin/cms/pages/schedule-page/revert")
    # Reverting discards the unpublished scheduling intent along with the draft.
    assert reverted.json()["draft"]["scheduled_publish_at"] is None


def test_preview_token_mint_requires_content_read_permission(client):
    from bson import ObjectId
    from app import security
    from app.main import app as fastapi_app

    async def _no_permissions_admin():
        # An empty list is falsy in Python, so `admin_permissions or ALL_ADMIN_PERMISSIONS`
        # in require_permission() would treat [] the same as "unset" (full admin) --
        # use a non-empty but unrelated permission set to actually simulate a
        # restricted admin, matching test_missing_permission_is_rejected above.
        return {"_id": ObjectId(), "email": "limited@test.local", "admin_permissions": ["dashboard.read"]}

    create_page(client, page="pricing")
    fastapi_app.dependency_overrides[security.require_admin] = _no_permissions_admin
    response = client.post("/api/admin/cms/pages/pricing/preview-token")
    assert response.status_code == 403
