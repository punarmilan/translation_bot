"""Regression tests for Phase 4: Features and Solutions moved onto the
generic CMS engine (admin-backend/app/cms/migrate_features_solutions.py),
the extended feature_grid / new solution_grid section types, and per-card
visibility filtering on the public read surface.

Migration-shape and idempotency tests run directly against the migration
function with a fresh in-memory db, mirroring test_migrate_landing.py --
that keeps them independent of the shared `client` fixture's own
startup-time migration run. The HTTP-level tests below use the `client`
fixture as-is, relying on the fact that its app startup already ran the
migration once.
"""

from mongomock_motor import AsyncMongoMockClient

from app.cms.migrate_features_solutions import (
    FEATURES_PAGE_KEY,
    SOLUTIONS_PAGE_KEY,
    migrate_features_and_solutions,
)
from app.repositories.cms_repository import CmsRepository


def _fresh_db():
    return AsyncMongoMockClient()["translation_bot"]


async def test_migration_seeds_features_page_with_flagship_and_capability_sections():
    db = _fresh_db()
    await migrate_features_and_solutions(db)

    doc = await CmsRepository(db).get_page(FEATURES_PAGE_KEY)
    assert doc is not None
    assert doc["published"] is not None
    sections = doc["published"]["sections"]
    by_key = {s["key"]: s for s in sections}
    assert set(by_key) == {"sec_flagship", "sec_capabilities"}
    assert len(by_key["sec_flagship"]["cards"]) == 4
    assert len(by_key["sec_capabilities"]["cards"]) == 20

    first = by_key["sec_flagship"]["cards"][0]
    assert first["title"] == "One conversation, personalized for every listener"
    assert "Per-participant language routing" in first["benefits"]
    assert first["why_it_matters"]
    assert first["icon"] == "Languages"


async def test_migration_seeds_solutions_page_with_eleven_solution_cards():
    db = _fresh_db()
    await migrate_features_and_solutions(db)

    doc = await CmsRepository(db).get_page(SOLUTIONS_PAGE_KEY)
    sections = doc["published"]["sections"]
    assert len(sections) == 1
    assert sections[0]["type"] == "solution_grid"
    cards = sections[0]["cards"]
    assert len(cards) == 11
    categories = {card["category"] for card in cards}
    assert "Education" in categories
    assert "Healthcare" in categories


async def test_migration_is_idempotent():
    db = _fresh_db()
    await migrate_features_and_solutions(db)
    first_features = await CmsRepository(db).get_page(FEATURES_PAGE_KEY)
    first_solutions = await CmsRepository(db).get_page(SOLUTIONS_PAGE_KEY)

    await migrate_features_and_solutions(db)
    second_features = await CmsRepository(db).get_page(FEATURES_PAGE_KEY)
    second_solutions = await CmsRepository(db).get_page(SOLUTIONS_PAGE_KEY)

    assert first_features["version"] == second_features["version"] == 1
    assert first_features["published"]["sections"] == second_features["published"]["sections"]
    assert first_solutions["version"] == second_solutions["version"] == 1


def test_solution_grid_and_extended_feature_grid_in_section_type_registry(client):
    response = client.get("/api/admin/cms/section-types")
    assert response.status_code == 200
    types_by_key = {t["key"]: t for t in response.json()["items"]}
    assert "solution_grid" in types_by_key
    solution_fields = {f["key"] for f in types_by_key["solution_grid"]["card_fields"]}
    assert {"category", "pain_points", "impact", "cta_text", "cta_link"} <= solution_fields

    feature_fields = {f["key"] for f in types_by_key["feature_grid"]["card_fields"]}
    assert {"eyebrow", "benefits", "why_it_matters", "use_cases", "cta_text"} <= feature_fields


def test_features_page_is_reachable_via_the_generic_admin_cms_api(client):
    response = client.get(f"/api/admin/cms/pages/{FEATURES_PAGE_KEY}")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "published"
    assert {s["key"] for s in body["draft"]["sections"]} == {"sec_flagship", "sec_capabilities"}


def test_public_features_endpoint_excludes_hidden_cards(client):
    doc = client.get(f"/api/admin/cms/pages/{FEATURES_PAGE_KEY}").json()
    sections = doc["draft"]["sections"]
    flagship = next(s for s in sections if s["key"] == "sec_flagship")
    flagship["cards"][0]["hidden"] = True

    saved = client.put(f"/api/admin/cms/pages/{FEATURES_PAGE_KEY}", json={"sections": sections, "seo": doc["draft"].get("seo", {})})
    assert saved.status_code == 200
    published = client.post(f"/api/admin/cms/pages/{FEATURES_PAGE_KEY}/publish")
    assert published.status_code == 200

    public = client.get("/api/public/cms/pages/features")
    assert public.status_code == 200
    public_flagship = next(s for s in public.json()["sections"] if s["key"] == "sec_flagship")
    assert len(public_flagship["cards"]) == 3
    assert all(card["title"] != "One conversation, personalized for every listener" for card in public_flagship["cards"])

    # The admin view still shows the hidden card -- hidden means "not public", not "deleted".
    admin_view = client.get(f"/api/admin/cms/pages/{FEATURES_PAGE_KEY}").json()
    admin_flagship = next(s for s in admin_view["draft"]["sections"] if s["key"] == "sec_flagship")
    assert len(admin_flagship["cards"]) == 4


def test_features_page_requires_content_permissions(client):
    from bson import ObjectId
    from app import security
    from app.main import app as fastapi_app

    async def _limited_admin():
        return {"_id": ObjectId(), "email": "limited@test.local", "admin_permissions": ["dashboard.read"]}

    fastapi_app.dependency_overrides[security.require_admin] = _limited_admin
    response = client.get(f"/api/admin/cms/pages/{FEATURES_PAGE_KEY}")
    assert response.status_code == 403
