"""Tests for the public backend's `/api/public/branding` endpoint (Phase 7:
Branding CMS), following the established convention in this test module
(calling the route function directly with app.routes.get_db patched, rather
than spinning up a TestClient/real MongoDB -- see test_cms_preview.py).

`app/routes.py` defines `/api/public/branding` twice (a pre-existing,
out-of-scope duplicate-route quirk, not introduced or fixed by this phase).
Starlette matches routes in registration order, so the FIRST definition is
the one that actually serves real HTTP traffic; the second overwrites the
`public_branding` name in the module namespace, so a plain
`from app.routes import public_branding` would silently test the *dead*
second copy instead. Looking the handler up by path in `router.routes`
retrieves the function object Starlette actually dispatches to, sidestepping
the name collision without needing to touch the duplicate-route bug itself.
"""

import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from app.routes import router


def _live_handler(path: str, method: str = "GET"):
    for route in router.routes:
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set()):
            return route.endpoint
    raise AssertionError(f"No route registered for {method} {path}")


public_branding = _live_handler("/api/public/branding")

EXPECTED_DEFAULT_KEYS = {
    "product_name", "site_title", "logo_url", "logo_dark_url", "favicon_url",
    "favicon_dark_url", "og_image", "twitter_card", "meta_description",
    "seo_keywords", "accent_color", "primary_color", "secondary_color",
    "font_family", "heading_font_family", "border_radius", "footer_text",
    "copyright_text", "company_name", "company_email", "company_website",
    "social_twitter", "social_linkedin", "social_github", "social_youtube",
}


class PublicBrandingEndpointTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.mock_db = MagicMock()
        self.patch_get_db = patch("app.routes.get_db", return_value=self.mock_db)
        self.patch_get_db.start()
        self.addCleanup(self.patch_get_db.stop)

    def _set_branding_doc(self, doc) -> None:
        collection = AsyncMock()
        collection.find_one = AsyncMock(return_value=doc)
        self.mock_db.__getitem__.return_value = collection

    async def test_returns_full_default_set_when_no_document_exists(self) -> None:
        self._set_branding_doc(None)
        result = await public_branding()
        values = result["branding"]
        self.assertEqual(values["product_name"], "VOXO")
        self.assertEqual(values["company_website"], "")
        self.assertEqual(values["social_twitter"], "")
        self.assertTrue(EXPECTED_DEFAULT_KEYS.issubset(values.keys()))

    async def test_returns_stored_values_verbatim_when_document_exists(self) -> None:
        stored = {"values": {"product_name": "Acme", "company_website": "acme.example", "social_github": "https://github.com/acme"}}
        self._set_branding_doc(stored)
        result = await public_branding()
        self.assertEqual(result["branding"], stored["values"])

    async def test_stored_document_with_only_some_fields_does_not_backfill_defaults(self) -> None:
        # Matches the endpoint's actual behavior (item.get("values", defaults),
        # not a merge) -- documented here so a future refactor to a merge
        # semantics is a deliberate choice, not an accidental regression.
        stored = {"values": {"product_name": "Acme"}}
        self._set_branding_doc(stored)
        result = await public_branding()
        self.assertEqual(result["branding"], {"product_name": "Acme"})


if __name__ == "__main__":
    unittest.main()
