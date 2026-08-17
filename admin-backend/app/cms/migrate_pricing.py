"""One-time, idempotent migration of the Pricing page onto the generic CMS
engine (Phase 5). Runs at admin-backend startup; a no-op on every run after
the first -- mirrors migrate_features_solutions.py's approach for the same
reason: a one-off seed for one specific, pre-existing page is page-specific,
so it lives here rather than in the page-agnostic CmsRepository/cms.py
router.

The seeded card content is transcribed verbatim from the previously-hardcoded
plan cards in frontend/src/pages/PricingPage.jsx, so publishing this
migration's output changes nothing about what visitors see -- it only moves
the data from a frontend literal into an admin-editable CMS page. No prices,
feature names, or commercial claims are invented; every value here is a
one-to-one copy of what was already live.

The plan comparison-matrix table further down the same public page is left
hardcoded -- no existing section type expresses a shared-row-per-feature
table shape, and inventing one is out of scope for this migration.
"""

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.repositories.cms_repository import CmsRepository

PRICING_PAGE_KEY = "pricing"
PRICING_PAGE_LABEL = "Pricing"
MIGRATION_ACTOR = "system:migration"


def _plan_card(
    title: str,
    description: str,
    currency_symbol: str,
    price_amount: str,
    yearly_price_amount: str,
    price_period: str,
    features: list[str],
    badge_text: str,
    highlighted: bool,
    cta_text: str,
    cta_link: str,
) -> dict:
    return {
        "title": title,
        "description": description,
        "currency_symbol": currency_symbol,
        "price_amount": price_amount,
        "yearly_price_amount": yearly_price_amount,
        "price_period": price_period,
        "features": "\n".join(features),
        "icon": "",
        "badge_text": badge_text,
        "highlighted": highlighted,
        "cta_text": cta_text,
        "cta_link": cta_link,
        "hidden": False,
    }


PLAN_CARDS = [
    _plan_card(
        "Starter",
        "Perfect for individuals, students, and small team chats.",
        "$", "0", "0", "/mo",
        [
            "English & Hindi support",
            "Live Text Translation",
            "Live Chat Translation",
            "Basic Captions",
            "Limited participants (up to 4)",
            "40-minute meeting duration limit",
            "24-hour meeting history",
        ],
        "", False,
        "Choose Starter", "/signup",
    ),
    _plan_card(
        "Professional",
        "Optimized for remote professionals, remote teams, and teachers.",
        "$", "19", "15", "/mo",
        [
            "All dynamic languages (10+)",
            "Voice Translation playback",
            "Screen Sharing",
            "Collaborative Whiteboard",
            "Shared Meeting Notes",
            "Local Meeting Recording",
            "AI Meeting Summaries",
            "Host Moderation Controls",
            "Up to 50 participants limit",
            "30-day meeting history",
        ],
        "Most Popular", True,
        "Upgrade with Razorpay", "",
    ),
    _plan_card(
        "Enterprise",
        "Dedicated infrastructure and custom workflows for NGOs and corporate teams.",
        "", "Custom", "Custom", "",
        [
            "Unlimited languages",
            "Unlimited participants & meetings",
            "Organizations, users & roles",
            "Multi-tenant Admin Dashboard",
            "Secure Webhooks and API access",
            "Dedicated Support and SLAs",
            "On-Premise / Self-Hosting Options",
            "Custom Branding settings",
        ],
        "", False,
        "Contact Sales", "mailto:sales@giftme.watch",
    ),
]


async def _seed_page(repo: CmsRepository, page_key: str, label: str, sections: list[dict]) -> None:
    if await repo.get_page(page_key):
        return
    await repo.create_page(page_key, label, MIGRATION_ACTOR)
    await repo.save_draft(page_key, sections, MIGRATION_ACTOR)
    await repo.publish(page_key, MIGRATION_ACTOR)


async def migrate_pricing(db: AsyncIOMotorDatabase) -> None:
    repo = CmsRepository(db)

    await _seed_page(repo, PRICING_PAGE_KEY, PRICING_PAGE_LABEL, [
        {
            "key": "sec_plans", "type": "pricing_grid", "name": "Pricing Plans", "hidden": False,
            "eyebrow": "", "title": "", "body": "",
            "cards": PLAN_CARDS,
        },
    ])
