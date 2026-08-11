"""Generic CMS section-type schema registry.

Every page (landing, features, pricing, blogs, about, docs, ...) is composed of
an ordered list of *sections*, and every section is an instance of one of the
types declared here. The registry is the single source of truth for which
fields a section type has and how the admin editor should render them --
adding a new section type here immediately makes it available to every page,
with no page-specific editor code required anywhere.

Field ``type`` values understood by the generic admin-frontend form renderer:
    text, textarea, richtext, image, url, boolean, number, select
"""

from typing import Any, TypedDict


class FieldSchema(TypedDict, total=False):
    key: str
    label: str
    type: str
    default: Any
    options: list[str]
    max_length: int


class SectionTypeSchema(TypedDict, total=False):
    key: str
    label: str
    description: str
    fields: list[FieldSchema]
    supports_cards: bool
    card_label: str
    card_fields: list[FieldSchema]


_COMMON_HEADING_FIELDS: list[FieldSchema] = [
    {"key": "eyebrow", "label": "Eyebrow", "type": "text", "default": ""},
    {"key": "title", "label": "Title", "type": "text", "default": ""},
    {"key": "body", "label": "Body", "type": "richtext", "default": ""},
]

_CARD_FIELDS_BASIC: list[FieldSchema] = [
    {"key": "title", "label": "Title", "type": "text", "default": ""},
    {"key": "description", "label": "Description", "type": "textarea", "default": ""},
    {"key": "icon", "label": "Icon / Emoji", "type": "text", "default": ""},
    {"key": "image_url", "label": "Image", "type": "image", "default": ""},
]

_FEATURE_CARD_FIELDS: list[FieldSchema] = [
    {"key": "eyebrow", "label": "Eyebrow / Category (flagship cards only)", "type": "text", "default": ""},
    {"key": "title", "label": "Title", "type": "text", "default": ""},
    {"key": "description", "label": "Description", "type": "textarea", "default": ""},
    {"key": "benefits", "label": "Benefits (one per line, flagship cards only)", "type": "textarea", "default": ""},
    {"key": "why_it_matters", "label": "Why it matters", "type": "textarea", "default": ""},
    {"key": "use_cases", "label": "Use cases", "type": "textarea", "default": ""},
    {"key": "icon", "label": "Icon / Emoji", "type": "text", "default": ""},
    {"key": "image_url", "label": "Image", "type": "image", "default": ""},
    {"key": "cta_text", "label": "CTA Label (optional)", "type": "text", "default": ""},
    {"key": "cta_link", "label": "CTA Link (optional)", "type": "url", "default": ""},
]

_SOLUTION_CARD_FIELDS: list[FieldSchema] = [
    {"key": "category", "label": "Category / Label", "type": "text", "default": ""},
    {"key": "title", "label": "Problem statement (heading)", "type": "text", "default": ""},
    {"key": "pain_points", "label": "Pain points (one per line)", "type": "textarea", "default": ""},
    {"key": "description", "label": "How VOXO helps", "type": "textarea", "default": ""},
    {"key": "impact", "label": "Expected impact", "type": "textarea", "default": ""},
    {"key": "icon", "label": "Icon / Emoji", "type": "text", "default": ""},
    {"key": "image_url", "label": "Image", "type": "image", "default": ""},
    {"key": "cta_text", "label": "CTA Label (optional)", "type": "text", "default": ""},
    {"key": "cta_link", "label": "CTA Link (optional)", "type": "url", "default": ""},
]

SECTION_TYPE_REGISTRY: dict[str, SectionTypeSchema] = {
    "hero": {
        "key": "hero",
        "label": "Hero",
        "description": "Top-of-page banner with a headline, supporting copy, and primary/secondary calls to action.",
        "fields": [
            *_COMMON_HEADING_FIELDS,
            {"key": "cta_text", "label": "Primary CTA Label", "type": "text", "default": ""},
            {"key": "cta_link", "label": "Primary CTA Link", "type": "url", "default": ""},
            {"key": "secondary_cta_text", "label": "Secondary CTA Label", "type": "text", "default": ""},
            {"key": "secondary_cta_link", "label": "Secondary CTA Link", "type": "url", "default": ""},
            {"key": "image_url", "label": "Hero Image", "type": "image", "default": ""},
            {"key": "micro_1_text", "label": "Micro-indicator 1", "type": "text", "default": ""},
            {"key": "micro_2_text", "label": "Micro-indicator 2", "type": "text", "default": ""},
            {"key": "micro_3_text", "label": "Micro-indicator 3", "type": "text", "default": ""},
        ],
        "supports_cards": True,
        "card_label": "Highlight",
        "card_fields": _CARD_FIELDS_BASIC,
    },
    "showcase": {
        "key": "showcase",
        "label": "Marquee Showcase",
        "description": "Heading plus a scrolling two-row marquee of feature cards (image or icon).",
        "fields": _COMMON_HEADING_FIELDS,
        "supports_cards": True,
        "card_label": "Card",
        "card_fields": _CARD_FIELDS_BASIC,
    },
    "benefits": {
        "key": "benefits",
        "label": "Core Benefits",
        "description": "Heading plus a simple 3-up grid of icon/title/description benefit cards.",
        "fields": _COMMON_HEADING_FIELDS,
        "supports_cards": True,
        "card_label": "Benefit",
        "card_fields": _CARD_FIELDS_BASIC,
    },
    "richtext": {
        "key": "richtext",
        "label": "Rich Text",
        "description": "Freeform heading and body copy block, e.g. an About or Docs page section.",
        "fields": _COMMON_HEADING_FIELDS,
        "supports_cards": False,
        "card_fields": [],
    },
    "feature_grid": {
        "key": "feature_grid",
        "label": "Feature Grid",
        "description": "Heading plus a grid of feature cards (title, description, benefits, why-it-matters, use cases, optional CTA). Used by the public Features page's flagship and capability-catalog sections.",
        "fields": _COMMON_HEADING_FIELDS,
        "supports_cards": True,
        "card_label": "Feature",
        "card_fields": _FEATURE_CARD_FIELDS,
    },
    "solution_grid": {
        "key": "solution_grid",
        "label": "Solution Grid",
        "description": "Heading plus a grid of industry/use-case solution cards (category, problem, pain points, how VOXO helps, impact, optional CTA). Used by the public Solutions page.",
        "fields": _COMMON_HEADING_FIELDS,
        "supports_cards": True,
        "card_label": "Solution",
        "card_fields": _SOLUTION_CARD_FIELDS,
    },
    "testimonials": {
        "key": "testimonials",
        "label": "Testimonials",
        "description": "Heading plus a set of customer quotes.",
        "fields": _COMMON_HEADING_FIELDS,
        "supports_cards": True,
        "card_label": "Testimonial",
        "card_fields": [
            {"key": "description", "label": "Quote", "type": "textarea", "default": ""},
            {"key": "author", "label": "Author", "type": "text", "default": ""},
            {"key": "role", "label": "Role / Title", "type": "text", "default": ""},
            {"key": "company", "label": "Company", "type": "text", "default": ""},
            {"key": "image_url", "label": "Avatar", "type": "image", "default": ""},
        ],
    },
    "faq": {
        "key": "faq",
        "label": "FAQ",
        "description": "Heading plus a list of question/answer pairs.",
        "fields": _COMMON_HEADING_FIELDS,
        "supports_cards": True,
        "card_label": "Question",
        "card_fields": [
            {"key": "question", "label": "Question", "type": "text", "default": ""},
            {"key": "answer", "label": "Answer", "type": "textarea", "default": ""},
        ],
    },
    "cta": {
        "key": "cta",
        "label": "Call To Action",
        "description": "Closing banner with a headline and one or two buttons.",
        "fields": [
            *_COMMON_HEADING_FIELDS,
            {"key": "cta_text", "label": "Primary CTA Label", "type": "text", "default": ""},
            {"key": "cta_link", "label": "Primary CTA Link", "type": "url", "default": ""},
            {"key": "secondary_cta_text", "label": "Secondary CTA Label", "type": "text", "default": ""},
            {"key": "secondary_cta_link", "label": "Secondary CTA Link", "type": "url", "default": ""},
        ],
        "supports_cards": False,
        "card_fields": [],
    },
    "custom": {
        "key": "custom",
        "label": "Custom Block",
        "description": "Generic heading plus an arbitrary card list, for content that doesn't fit another type.",
        "fields": _COMMON_HEADING_FIELDS,
        "supports_cards": True,
        "card_label": "Item",
        "card_fields": [*_CARD_FIELDS_BASIC, {"key": "link_url", "label": "Link", "type": "url", "default": ""}],
    },
    "statistics": {
        "key": "statistics",
        "label": "Statistics",
        "description": "Heading plus a row of metric cards (value + label). Ships with zero cards -- add real, verified numbers before publishing.",
        "fields": _COMMON_HEADING_FIELDS,
        "supports_cards": True,
        "card_label": "Metric",
        "card_fields": [
            {"key": "value", "label": "Value (e.g. \"10k+\")", "type": "text", "default": ""},
            {"key": "label", "label": "Label", "type": "text", "default": ""},
            {"key": "icon", "label": "Icon / Emoji", "type": "text", "default": ""},
        ],
    },
    "trusted_by": {
        "key": "trusted_by",
        "label": "Trusted By",
        "description": "Heading plus a row of partner/customer logos. Ships with zero cards -- add real logos and names before publishing.",
        "fields": _COMMON_HEADING_FIELDS,
        "supports_cards": True,
        "card_label": "Logo",
        "card_fields": [
            {"key": "name", "label": "Company / Partner Name", "type": "text", "default": ""},
            {"key": "logo_url", "label": "Logo", "type": "image", "default": ""},
            {"key": "link_url", "label": "Link (optional)", "type": "url", "default": ""},
        ],
    },
    "footer_cta": {
        "key": "footer_cta",
        "label": "Footer CTA",
        "description": "The final call-to-action banner immediately before the site footer. Distinct from the general-purpose CTA type so it can carry its own footer-adjacent styling.",
        "fields": [
            *_COMMON_HEADING_FIELDS,
            {"key": "cta_text", "label": "Button Label", "type": "text", "default": ""},
            {"key": "cta_link", "label": "Button Link", "type": "url", "default": ""},
        ],
        "supports_cards": False,
        "card_fields": [],
    },
}


def list_section_types() -> list[SectionTypeSchema]:
    return list(SECTION_TYPE_REGISTRY.values())


def get_section_type(key: str) -> SectionTypeSchema | None:
    return SECTION_TYPE_REGISTRY.get(key)


def default_section(type_key: str, key: str, name: str) -> dict[str, Any]:
    schema = get_section_type(type_key)
    if not schema:
        raise ValueError(f"Unknown section type: {type_key}")
    section: dict[str, Any] = {"key": key, "type": type_key, "name": name, "hidden": False}
    for field in schema["fields"]:
        section[field["key"]] = field.get("default", "")
    section["cards"] = []
    return section
