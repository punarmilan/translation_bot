"""Regression tests for Phase 6: the global Navbar and Footer moved onto the
generic CMS engine (admin-backend/app/cms/migrate_global_nav_footer.py), the
new navbar/footer section types, and the shared draft/publish/revert/
visibility/permission behavior applied to the "global-nav" and
"global-footer" pages.

Migration-shape and idempotency tests run directly against the migration
function with a fresh in-memory db, mirroring test_migrate_landing.py and
test_pricing_cms.py -- that keeps them independent of the shared `client`
fixture's own startup-time migration run. The HTTP-level tests below use the
`client` fixture as-is, relying on the fact that its app startup already ran
the migration once.
"""

from mongomock_motor import AsyncMongoMockClient

from app.cms.migrate_global_nav_footer import (
    GLOBAL_FOOTER_PAGE_KEY,
    GLOBAL_NAV_PAGE_KEY,
    migrate_global_nav_footer,
)
from app.repositories.cms_repository import CmsRepository


def _fresh_db():
    return AsyncMongoMockClient()["translation_bot"]


async def test_migration_seeds_global_nav_page_with_five_links():
    db = _fresh_db()
    await migrate_global_nav_footer(db)

    doc = await CmsRepository(db).get_page(GLOBAL_NAV_PAGE_KEY)
    assert doc is not None
    assert doc["published"] is not None
    sections = doc["published"]["sections"]
    assert len(sections) == 1
    assert sections[0]["key"] == "sec_navbar"
    assert sections[0]["type"] == "navbar"
    assert sections[0]["product_name"] == "VOXO"
    cards = sections[0]["cards"]
    assert [c["label"] for c in cards] == ["Home", "Features", "Solutions", "Pricing", "About"]
    assert all(c["parent_label"] == "" for c in cards)


async def test_migration_seeds_global_footer_page_with_seven_links():
    db = _fresh_db()
    await migrate_global_nav_footer(db)

    doc = await CmsRepository(db).get_page(GLOBAL_FOOTER_PAGE_KEY)
    sections = doc["published"]["sections"]
    assert len(sections) == 1
    assert sections[0]["type"] == "footer"
    assert "{year}" in sections[0]["copyright_text"]
    cards = sections[0]["cards"]
    assert len(cards) == 7
    assert cards[0]["label"] == "Features"
    assert cards[-1]["label"] == "About"
    assert all(c["group"] == "" for c in cards)


async def test_migration_is_idempotent():
    db = _fresh_db()
    await migrate_global_nav_footer(db)
    first_nav = await CmsRepository(db).get_page(GLOBAL_NAV_PAGE_KEY)
    first_footer = await CmsRepository(db).get_page(GLOBAL_FOOTER_PAGE_KEY)

    await migrate_global_nav_footer(db)
    second_nav = await CmsRepository(db).get_page(GLOBAL_NAV_PAGE_KEY)
    second_footer = await CmsRepository(db).get_page(GLOBAL_FOOTER_PAGE_KEY)

    assert first_nav["version"] == second_nav["version"] == 1
    assert first_nav["published"]["sections"] == second_nav["published"]["sections"]
    assert first_footer["version"] == second_footer["version"] == 1
    assert first_footer["published"]["sections"] == second_footer["published"]["sections"]


def test_navbar_and_footer_types_in_section_type_registry(client):
    response = client.get("/api/admin/cms/section-types")
    assert response.status_code == 200
    types_by_key = {t["key"]: t for t in response.json()["items"]}

    assert "navbar" in types_by_key
    nav_fields = {f["key"] for f in types_by_key["navbar"]["fields"]}
    assert {"logo_image_url", "product_name", "login_text", "login_link", "cta_text", "cta_link"} <= nav_fields
    nav_card_fields = {f["key"] for f in types_by_key["navbar"]["card_fields"]}
    assert {"label", "link", "parent_label"} <= nav_card_fields

    assert "footer" in types_by_key
    footer_fields = {f["key"] for f in types_by_key["footer"]["fields"]}
    assert {"logo_image_url", "description", "copyright_text", "contact_email", "contact_phone"} <= footer_fields
    footer_card_fields = {f["key"] for f in types_by_key["footer"]["card_fields"]}
    assert {"label", "link", "group"} <= footer_card_fields


def test_global_nav_and_footer_pages_are_reachable_via_the_generic_admin_cms_api(client):
    nav = client.get(f"/api/admin/cms/pages/{GLOBAL_NAV_PAGE_KEY}")
    assert nav.status_code == 200
    assert nav.json()["status"] == "published"
    assert len(nav.json()["draft"]["sections"][0]["cards"]) == 5

    footer = client.get(f"/api/admin/cms/pages/{GLOBAL_FOOTER_PAGE_KEY}")
    assert footer.status_code == 200
    assert footer.json()["status"] == "published"
    assert len(footer.json()["draft"]["sections"][0]["cards"]) == 7


def test_public_global_nav_endpoint_excludes_hidden_cards_and_respects_order(client):
    doc = client.get(f"/api/admin/cms/pages/{GLOBAL_NAV_PAGE_KEY}").json()
    sections = doc["draft"]["sections"]
    cards = sections[0]["cards"]
    cards[0]["hidden"] = True  # hide "Home"
    sections[0]["cards"] = [cards[1], cards[0], *cards[2:]]  # reorder

    saved = client.put(f"/api/admin/cms/pages/{GLOBAL_NAV_PAGE_KEY}", json={"sections": sections, "seo": doc["draft"].get("seo", {})})
    assert saved.status_code == 200
    published = client.post(f"/api/admin/cms/pages/{GLOBAL_NAV_PAGE_KEY}/publish")
    assert published.status_code == 200

    public = client.get(f"/api/public/cms/pages/{GLOBAL_NAV_PAGE_KEY}")
    assert public.status_code == 200
    public_cards = public.json()["sections"][0]["cards"]
    assert len(public_cards) == 4
    assert public_cards[0]["label"] == "Features"
    assert all(c["label"] != "Home" for c in public_cards)

    # Hidden means "not public", not "deleted" -- the admin view still shows it.
    admin_view = client.get(f"/api/admin/cms/pages/{GLOBAL_NAV_PAGE_KEY}").json()
    assert len(admin_view["draft"]["sections"][0]["cards"]) == 5


def test_public_global_footer_endpoint_serves_only_published_data(client):
    public = client.get(f"/api/public/cms/pages/{GLOBAL_FOOTER_PAGE_KEY}")
    assert public.status_code == 200
    assert len(public.json()["sections"][0]["cards"]) == 7

    doc = client.get(f"/api/admin/cms/pages/{GLOBAL_FOOTER_PAGE_KEY}").json()
    sections = doc["draft"]["sections"]
    sections[0]["copyright_text"] = "© draft edit, not yet published"
    saved = client.put(f"/api/admin/cms/pages/{GLOBAL_FOOTER_PAGE_KEY}", json={"sections": sections, "seo": doc["draft"].get("seo", {})})
    assert saved.status_code == 200

    still_published = client.get(f"/api/public/cms/pages/{GLOBAL_FOOTER_PAGE_KEY}")
    assert "{year}" in still_published.json()["sections"][0]["copyright_text"]


def test_global_footer_draft_publish_revert_lifecycle(client):
    doc = client.get(f"/api/admin/cms/pages/{GLOBAL_FOOTER_PAGE_KEY}").json()
    sections = doc["draft"]["sections"]
    sections[0]["cards"][0]["group"] = "Product"

    saved = client.put(f"/api/admin/cms/pages/{GLOBAL_FOOTER_PAGE_KEY}", json={"sections": sections, "seo": doc["draft"].get("seo", {})})
    assert saved.status_code == 200
    assert client.get(f"/api/public/cms/pages/{GLOBAL_FOOTER_PAGE_KEY}").json()["sections"][0]["cards"][0]["group"] == ""

    published = client.post(f"/api/admin/cms/pages/{GLOBAL_FOOTER_PAGE_KEY}/publish")
    assert published.status_code == 200
    assert client.get(f"/api/public/cms/pages/{GLOBAL_FOOTER_PAGE_KEY}").json()["sections"][0]["cards"][0]["group"] == "Product"

    reverted = client.post(f"/api/admin/cms/pages/{GLOBAL_FOOTER_PAGE_KEY}/revert")
    assert reverted.status_code == 200
    assert reverted.json()["draft"]["sections"][0]["cards"][0]["group"] == "Product"


def test_global_nav_page_requires_content_permissions(client):
    from bson import ObjectId
    from app import security
    from app.main import app as fastapi_app

    async def _limited_admin():
        return {"_id": ObjectId(), "email": "limited@test.local", "admin_permissions": ["dashboard.read"]}

    fastapi_app.dependency_overrides[security.require_admin] = _limited_admin
    response = client.get(f"/api/admin/cms/pages/{GLOBAL_NAV_PAGE_KEY}")
    assert response.status_code == 403


def test_global_footer_page_rejects_section_without_a_type(client):
    doc = client.get(f"/api/admin/cms/pages/{GLOBAL_FOOTER_PAGE_KEY}").json()
    sections = doc["draft"]["sections"]
    sections.append({"key": "sec_bad", "name": "Bad section", "cards": []})

    response = client.put(f"/api/admin/cms/pages/{GLOBAL_FOOTER_PAGE_KEY}", json={"sections": sections, "seo": doc["draft"].get("seo", {})})
    assert response.status_code == 400


def test_global_nav_page_rejects_unknown_section_type_on_add(client):
    response = client.post(
        f"/api/admin/cms/pages/{GLOBAL_NAV_PAGE_KEY}/sections",
        json={"type": "not-a-real-type", "name": "Bogus"},
    )
    assert response.status_code == 400
