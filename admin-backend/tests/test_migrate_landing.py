"""Unit tests for the one-time Landing migration (Phase 2), exercised directly
against the migration function rather than through the HTTP app, so a custom
pre-existing `landing_sections` fixture can be seeded *before* the migration
runs -- something the shared `client` fixture's startup-time migration run
doesn't allow.
"""

from mongomock_motor import AsyncMongoMockClient

from app.cms.migrate_landing import migrate_landing_page
from app.repositories.cms_repository import CmsRepository
from app.routers.platform import DEFAULT_PAGE_SECTIONS


def _fresh_db():
    return AsyncMongoMockClient()["translation_bot"]


async def test_migration_seeds_defaults_when_landing_sections_is_empty():
    db = _fresh_db()
    await migrate_landing_page(db)

    doc = await CmsRepository(db).get_page("landing")
    assert doc is not None
    assert doc["version"] == 1
    assert doc["published"] is not None
    assert len(doc["published"]["sections"]) == len(DEFAULT_PAGE_SECTIONS)
    assert doc["published"]["sections"][0]["type"] == "hero"
    # Draft and published start identical -- nothing is "modified" pre-launch.
    assert doc["draft"]["sections"] == doc["published"]["sections"]


async def test_migration_prefers_existing_landing_sections_data_over_defaults():
    db = _fresh_db()
    await db["landing_sections"].insert_one({
        "key": "sec_hero",
        "type": "hero",
        "name": "Hero",
        "hidden": False,
        "title": "Custom admin-edited headline",
        "order": 0,
        "cards": [],
    })

    await migrate_landing_page(db)

    doc = await CmsRepository(db).get_page("landing")
    sections = doc["published"]["sections"]
    assert len(sections) == 1
    assert sections[0]["title"] == "Custom admin-edited headline"
    # Mongo-only bookkeeping fields must not leak into the generic CMS shape.
    assert "_id" not in sections[0]
    assert "order" not in sections[0]


async def test_migration_is_idempotent():
    db = _fresh_db()
    await migrate_landing_page(db)
    first = await CmsRepository(db).get_page("landing")

    await migrate_landing_page(db)
    second = await CmsRepository(db).get_page("landing")

    assert first["version"] == second["version"] == 1
    assert first["published"]["sections"] == second["published"]["sections"]
