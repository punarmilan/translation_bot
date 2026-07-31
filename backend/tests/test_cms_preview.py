"""Tests for the public backend's draft-content preview endpoint (Phase 2:
Landing migration). This is the verification side of the CMS preview-token
flow -- admin-backend mints the token (see
admin-backend/app/routers/cms.py::mint_preview_token), this endpoint verifies
it. Follows the existing convention in this test module: unittest.IsolatedAsyncioTestCase,
calling the route function directly with app.routes.get_db patched, rather
than spinning up a TestClient/real MongoDB.
"""

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import jwt
from fastapi import HTTPException

from app.config import get_settings
from app.routes import public_cms_page_preview


def _mint(page: str, *, ttl_seconds: int = 300, purpose: str = "cms_preview") -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    claims = {
        "page": page,
        "purpose": purpose,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=ttl_seconds)).timestamp()),
    }
    return jwt.encode(claims, settings.CMS_PREVIEW_SECRET, algorithm="HS256")


class CmsPreviewEndpointTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.mock_db = MagicMock()
        self.patch_get_db = patch("app.routes.get_db", return_value=self.mock_db)
        self.patch_get_db.start()
        self.addCleanup(self.patch_get_db.stop)

    def _set_cms_pages_doc(self, doc) -> None:
        collection = AsyncMock()
        collection.find_one = AsyncMock(return_value=doc)
        self.mock_db.__getitem__.return_value = collection

    async def test_valid_token_returns_draft_sections_and_hides_hidden_ones(self) -> None:
        self._set_cms_pages_doc({
            "page": "landing",
            "draft": {"sections": [
                {"key": "sec_1", "type": "hero", "title": "Draft headline", "hidden": False},
                {"key": "sec_2", "type": "cta", "title": "Hidden section", "hidden": True},
            ]},
        })
        token = _mint("landing")

        result = await public_cms_page_preview("landing", token)

        self.assertTrue(result["preview"])
        self.assertEqual([s["title"] for s in result["sections"]], ["Draft headline"])

    async def test_expired_token_is_rejected(self) -> None:
        token = _mint("landing", ttl_seconds=-10)
        with self.assertRaises(HTTPException) as ctx:
            await public_cms_page_preview("landing", token)
        self.assertEqual(ctx.exception.status_code, 401)

    async def test_token_for_a_different_page_is_rejected(self) -> None:
        # A preview token minted for "pricing" must not unlock "landing"'s draft.
        token = _mint("pricing")
        with self.assertRaises(HTTPException) as ctx:
            await public_cms_page_preview("landing", token)
        self.assertEqual(ctx.exception.status_code, 401)

    async def test_token_with_wrong_purpose_is_rejected(self) -> None:
        token = _mint("landing", purpose="something_else")
        with self.assertRaises(HTTPException) as ctx:
            await public_cms_page_preview("landing", token)
        self.assertEqual(ctx.exception.status_code, 401)

    async def test_garbage_token_is_rejected(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            await public_cms_page_preview("landing", "not-a-real-token")
        self.assertEqual(ctx.exception.status_code, 401)

    async def test_missing_page_document_is_404(self) -> None:
        self._set_cms_pages_doc(None)
        token = _mint("landing")
        with self.assertRaises(HTTPException) as ctx:
            await public_cms_page_preview("landing", token)
        self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
