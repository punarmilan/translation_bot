"""One-time, idempotent migration of the global Navbar and Footer onto the
generic CMS engine (Phase 6). Runs at admin-backend startup; a no-op on every
run after the first -- mirrors migrate_features_solutions.py/migrate_pricing.py's
approach for the same reason: a one-off seed for site-wide chrome is
chrome-specific, so it lives here rather than in the page-agnostic
CmsRepository/cms.py router.

The seeded content is transcribed verbatim from the previously-hardcoded
markup in frontend/src/components/landing/Navbar.jsx and Footer.jsx, so
publishing this migration's output changes nothing about what visitors see --
it only moves the data from frontend literals into an admin-editable CMS
page. No new links, labels, or claims are invented.

Unlike a normal routed page, "global-nav" and "global-footer" are CMS page
*keys* only -- there is no /global-nav route. Every public page reads both
via the same generic getCmsPage() call Features/Solutions/Pricing already
use, since Navbar/Footer render on every page.

Copyright text may contain the literal token "{year}", which the public
frontend substitutes with the current year at render time -- preserving the
original hardcoded component's `new Date().getFullYear()` behavior instead
of freezing a stale year into seeded content.
"""

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.repositories.cms_repository import CmsRepository

GLOBAL_NAV_PAGE_KEY = "global-nav"
GLOBAL_NAV_PAGE_LABEL = "Global Navigation"
GLOBAL_FOOTER_PAGE_KEY = "global-footer"
GLOBAL_FOOTER_PAGE_LABEL = "Global Footer"
MIGRATION_ACTOR = "system:migration"


def _nav_link(label: str, link: str, parent_label: str = "") -> dict:
    return {"label": label, "link": link, "parent_label": parent_label, "hidden": False}


NAV_LINKS = [
    _nav_link("Home", "/"),
    _nav_link("Features", "/features"),
    _nav_link("Solutions", "/solutions"),
    _nav_link("Pricing", "/pricing"),
    _nav_link("About", "/about"),
]


def _footer_link(label: str, link: str, group: str = "") -> dict:
    return {"label": label, "link": link, "group": group, "hidden": False}


FOOTER_LINKS = [
    _footer_link("Features", "/features"),
    _footer_link("Solutions", "/solutions"),
    _footer_link("How it works", "/how-it-works"),
    _footer_link("Help Centre", "/help"),
    _footer_link("Pricing", "/pricing"),
    _footer_link("Blog", "/blog"),
    _footer_link("About", "/about"),
]


async def _seed_page(repo: CmsRepository, page_key: str, label: str, sections: list[dict]) -> None:
    if await repo.get_page(page_key):
        return
    await repo.create_page(page_key, label, MIGRATION_ACTOR)
    await repo.save_draft(page_key, sections, MIGRATION_ACTOR)
    await repo.publish(page_key, MIGRATION_ACTOR)


async def migrate_global_nav_footer(db: AsyncIOMotorDatabase) -> None:
    repo = CmsRepository(db)

    await _seed_page(repo, GLOBAL_NAV_PAGE_KEY, GLOBAL_NAV_PAGE_LABEL, [
        {
            "key": "sec_navbar", "type": "navbar", "name": "Global Navigation", "hidden": False,
            "logo_image_url": "", "product_name": "VOXO",
            "login_text": "Sign in", "login_link": "/login",
            "cta_text": "Get started", "cta_link": "/signup",
            "cards": NAV_LINKS,
        },
    ])

    await _seed_page(repo, GLOBAL_FOOTER_PAGE_KEY, GLOBAL_FOOTER_PAGE_LABEL, [
        {
            "key": "sec_footer", "type": "footer", "name": "Global Footer", "hidden": False,
            "logo_image_url": "", "product_name": "VOXO",
            "description": "VOXO — Real-time multilingual meetings without language barriers.",
            "cta_label": "Ready to meet across languages?",
            "copyright_text": "© {year} VOXO by WorknAI Technologies India Pvt. Ltd. All rights reserved.",
            "secondary_text": "Meet, speak, and collaborate in any language.",
            "contact_email": "", "contact_phone": "",
            "cards": FOOTER_LINKS,
        },
    ])
