"""One-time, idempotent migration of the Landing page onto the generic CMS
engine (Phase 2). Runs at admin-backend startup; a no-op on every run after
the first.

This is deliberately *not* baked into the generic `CmsRepository`/`cms.py`
router -- those stay page-agnostic. A one-off data migration for one specific,
pre-existing page is inherently page-specific, so it lives here instead,
reusing the generic repository purely as a data sink.
"""

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.repositories.cms_repository import CmsRepository

LANDING_PAGE_KEY = "landing"
LANDING_PAGE_LABEL = "Landing Page"
MIGRATION_ACTOR = "system:migration"


def _clean_section(raw: dict) -> dict:
    section = dict(raw)
    section.pop("_id", None)
    section.pop("order", None)
    section.setdefault("cards", [])
    section.setdefault("hidden", False)
    return section


async def migrate_landing_page(db: AsyncIOMotorDatabase) -> None:
    """Seeds cms_pages["landing"] from whatever was already live: the legacy
    Page Builder's `landing_sections` collection if an admin has ever opened
    it (preserving real edits exactly), or the same DEFAULT_PAGE_SECTIONS seed
    it would otherwise have lazily created (preserving the out-of-the-box
    appearance exactly). Either way the migrated content is published
    immediately as version 1, matching how landing_sections content was
    already live with no draft stage at all.
    """
    repo = CmsRepository(db)
    if await repo.get_page(LANDING_PAGE_KEY):
        return

    legacy_docs = await db["landing_sections"].find({}).sort("order", 1).to_list(length=200)
    if legacy_docs:
        sections = [_clean_section(doc) for doc in legacy_docs]
    else:
        from app.routers.platform import DEFAULT_PAGE_SECTIONS
        sections = [_clean_section(dict(sec)) for sec in DEFAULT_PAGE_SECTIONS]

    await repo.create_page(LANDING_PAGE_KEY, LANDING_PAGE_LABEL, MIGRATION_ACTOR)
    await repo.save_draft(LANDING_PAGE_KEY, sections, MIGRATION_ACTOR)
    await repo.publish(LANDING_PAGE_KEY, MIGRATION_ACTOR)
