"""Regression tests for Phase 5: Pricing moved onto the generic CMS engine
(admin-backend/app/cms/migrate_pricing.py), the new pricing_grid section
type, and the shared draft/publish/revert/visibility/permission behavior
applied to the "pricing" page.

Migration-shape and idempotency tests run directly against the migration
function with a fresh in-memory db, mirroring test_migrate_landing.py and
test_features_solutions_cms.py -- that keeps them independent of the shared
`client` fixture's own startup-time migration run. The HTTP-level tests
below use the `client` fixture as-is, relying on the fact that its app
startup already ran the migration once.
"""

from mongomock_motor import AsyncMongoMockClient

from app.cms.migrate_pricing import PRICING_PAGE_KEY, migrate_pricing
from app.repositories.cms_repository import CmsRepository


def _fresh_db():
    return AsyncMongoMockClient()["translation_bot"]


async def test_migration_seeds_pricing_page_with_three_plan_cards():
    db = _fresh_db()
    await migrate_pricing(db)

    doc = await CmsRepository(db).get_page(PRICING_PAGE_KEY)
    assert doc is not None
    assert doc["published"] is not None
    sections = doc["published"]["sections"]
    assert len(sections) == 1
    assert sections[0]["key"] == "sec_plans"
    assert sections[0]["type"] == "pricing_grid"
    cards = sections[0]["cards"]
    assert len(cards) == 3
    titles = [card["title"] for card in cards]
    assert titles == ["Starter", "Professional", "Enterprise"]


async def test_migration_preserves_exact_pricing_values():
    db = _fresh_db()
    await migrate_pricing(db)

    doc = await CmsRepository(db).get_page(PRICING_PAGE_KEY)
    cards = doc["published"]["sections"][0]["cards"]
    starter, professional, enterprise = cards

    assert starter["price_amount"] == "0"
    assert starter["currency_symbol"] == "$"
    assert starter["highlighted"] is False

    assert professional["price_amount"] == "19"
    assert professional["yearly_price_amount"] == "15"
    assert professional["highlighted"] is True
    assert professional["badge_text"] == "Most Popular"
    assert "Screen Sharing" in professional["features"]

    assert enterprise["price_amount"] == "Custom"
    assert enterprise["currency_symbol"] == ""
    assert enterprise["cta_link"] == "mailto:sales@giftme.watch"


async def test_migration_is_idempotent():
    db = _fresh_db()
    await migrate_pricing(db)
    first = await CmsRepository(db).get_page(PRICING_PAGE_KEY)

    await migrate_pricing(db)
    second = await CmsRepository(db).get_page(PRICING_PAGE_KEY)

    assert first["version"] == second["version"] == 1
    assert first["published"]["sections"] == second["published"]["sections"]


def test_pricing_grid_is_in_section_type_registry(client):
    response = client.get("/api/admin/cms/section-types")
    assert response.status_code == 200
    types_by_key = {t["key"]: t for t in response.json()["items"]}
    assert "pricing_grid" in types_by_key
    fields = {f["key"] for f in types_by_key["pricing_grid"]["card_fields"]}
    assert {
        "price_amount", "yearly_price_amount", "price_period", "currency_symbol",
        "features", "highlighted", "badge_text", "cta_text", "cta_link",
    } <= fields


def test_pricing_page_is_reachable_via_the_generic_admin_cms_api(client):
    response = client.get(f"/api/admin/cms/pages/{PRICING_PAGE_KEY}")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "published"
    assert body["draft"]["sections"][0]["key"] == "sec_plans"
    assert len(body["draft"]["sections"][0]["cards"]) == 3


def test_public_pricing_endpoint_serves_only_published_data(client):
    public = client.get(f"/api/public/cms/pages/{PRICING_PAGE_KEY}")
    assert public.status_code == 200
    body = public.json()
    cards = body["sections"][0]["cards"]
    assert len(cards) == 3
    assert [c["title"] for c in cards] == ["Starter", "Professional", "Enterprise"]

    # Edit the draft without publishing -- public reads must still reflect
    # the previously published version, not the unpublished draft.
    doc = client.get(f"/api/admin/cms/pages/{PRICING_PAGE_KEY}").json()
    sections = doc["draft"]["sections"]
    sections[0]["cards"][0]["title"] = "Starter (draft edit)"
    saved = client.put(f"/api/admin/cms/pages/{PRICING_PAGE_KEY}", json={"sections": sections, "seo": doc["draft"].get("seo", {})})
    assert saved.status_code == 200

    still_published = client.get(f"/api/public/cms/pages/{PRICING_PAGE_KEY}")
    assert still_published.json()["sections"][0]["cards"][0]["title"] == "Starter"


def test_public_pricing_endpoint_excludes_hidden_cards_and_respects_order(client):
    doc = client.get(f"/api/admin/cms/pages/{PRICING_PAGE_KEY}").json()
    sections = doc["draft"]["sections"]
    cards = sections[0]["cards"]
    cards[0]["hidden"] = True
    # Reorder: move Enterprise (index 2) to the front.
    sections[0]["cards"] = [cards[2], cards[1], cards[0]]

    saved = client.put(f"/api/admin/cms/pages/{PRICING_PAGE_KEY}", json={"sections": sections, "seo": doc["draft"].get("seo", {})})
    assert saved.status_code == 200
    published = client.post(f"/api/admin/cms/pages/{PRICING_PAGE_KEY}/publish")
    assert published.status_code == 200

    public = client.get(f"/api/public/cms/pages/{PRICING_PAGE_KEY}")
    public_cards = public.json()["sections"][0]["cards"]
    assert len(public_cards) == 2
    assert [c["title"] for c in public_cards] == ["Enterprise", "Professional"]

    # Hidden means "not public", not "deleted" -- the admin view still shows it.
    admin_view = client.get(f"/api/admin/cms/pages/{PRICING_PAGE_KEY}").json()
    assert len(admin_view["draft"]["sections"][0]["cards"]) == 3


def test_pricing_page_draft_publish_revert_lifecycle(client):
    doc = client.get(f"/api/admin/cms/pages/{PRICING_PAGE_KEY}").json()
    sections = doc["draft"]["sections"]
    sections[0]["cards"][1]["price_amount"] = "29"

    saved = client.put(f"/api/admin/cms/pages/{PRICING_PAGE_KEY}", json={"sections": sections, "seo": doc["draft"].get("seo", {})})
    assert saved.status_code == 200
    assert saved.json()["draft"]["sections"][0]["cards"][1]["price_amount"] == "29"
    # Not published yet.
    assert client.get(f"/api/public/cms/pages/{PRICING_PAGE_KEY}").json()["sections"][0]["cards"][1]["price_amount"] == "19"

    published = client.post(f"/api/admin/cms/pages/{PRICING_PAGE_KEY}/publish")
    assert published.status_code == 200
    assert client.get(f"/api/public/cms/pages/{PRICING_PAGE_KEY}").json()["sections"][0]["cards"][1]["price_amount"] == "29"

    # Make a further, unpublished draft edit -- revert should discard it and
    # fall back to the last *published* snapshot ("29"), not the original ("19").
    doc2 = client.get(f"/api/admin/cms/pages/{PRICING_PAGE_KEY}").json()
    sections2 = doc2["draft"]["sections"]
    sections2[0]["cards"][1]["price_amount"] = "39"
    client.put(f"/api/admin/cms/pages/{PRICING_PAGE_KEY}", json={"sections": sections2, "seo": doc2["draft"].get("seo", {})})

    reverted = client.post(f"/api/admin/cms/pages/{PRICING_PAGE_KEY}/revert")
    assert reverted.status_code == 200
    assert reverted.json()["draft"]["sections"][0]["cards"][1]["price_amount"] == "29"


def test_pricing_page_requires_content_permissions(client):
    from bson import ObjectId
    from app import security
    from app.main import app as fastapi_app

    async def _limited_admin():
        return {"_id": ObjectId(), "email": "limited@test.local", "admin_permissions": ["dashboard.read"]}

    fastapi_app.dependency_overrides[security.require_admin] = _limited_admin
    response = client.get(f"/api/admin/cms/pages/{PRICING_PAGE_KEY}")
    assert response.status_code == 403


def test_pricing_page_rejects_section_without_a_type(client):
    doc = client.get(f"/api/admin/cms/pages/{PRICING_PAGE_KEY}").json()
    sections = doc["draft"]["sections"]
    sections.append({"key": "sec_bad", "name": "Bad section", "cards": []})

    response = client.put(f"/api/admin/cms/pages/{PRICING_PAGE_KEY}", json={"sections": sections, "seo": doc["draft"].get("seo", {})})
    assert response.status_code == 400


def test_pricing_page_rejects_unknown_section_type_on_add(client):
    response = client.post(
        f"/api/admin/cms/pages/{PRICING_PAGE_KEY}/sections",
        json={"type": "not-a-real-type", "name": "Bogus"},
    )
    assert response.status_code == 400
