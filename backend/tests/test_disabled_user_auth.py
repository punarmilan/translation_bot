"""Regression test for Phase 10: a disabled/banned user's still-valid JWT
could open a brand-new meeting WebSocket connection (and download files)
because app/routes.py's _get_user_from_token -- used by both the /ws/...
handler and the file-download route -- never checked is_disabled/deleted_at,
unlike the REST get_current_user dependency in app/auth/dependencies.py
which already did. Admin "Disable"/"Ban" now actually blocks new
connections, not just new logins.
"""

import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from app.routes import _get_user_from_token


class DisabledUserAuthTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.mock_db = MagicMock()
        self.patch_get_db = patch("app.routes.get_db", return_value=self.mock_db)
        self.patch_get_db.start()
        self.addCleanup(self.patch_get_db.stop)

        self.patch_decode = patch("app.routes.decode_token", return_value={"sub": "507f1f77bcf86cd799439011"})
        self.patch_decode.start()
        self.addCleanup(self.patch_decode.stop)

    def _set_user_doc(self, doc) -> None:
        users_collection = AsyncMock()
        users_collection.find_one = AsyncMock(return_value=doc)
        self.mock_db.__getitem__.return_value = users_collection

    async def test_disabled_user_is_rejected(self) -> None:
        self._set_user_doc({"_id": "user-1", "username": "banned", "is_disabled": True})
        result = await _get_user_from_token("valid-token")
        self.assertIsNone(result)

    async def test_soft_deleted_user_is_rejected(self) -> None:
        self._set_user_doc({"_id": "user-1", "username": "gone", "deleted_at": "2026-01-01T00:00:00Z"})
        result = await _get_user_from_token("valid-token")
        self.assertIsNone(result)

    async def test_active_user_is_accepted(self) -> None:
        self._set_user_doc({"_id": "user-1", "username": "active", "is_disabled": False})
        result = await _get_user_from_token("valid-token")
        self.assertIsNotNone(result)
        self.assertEqual(result["username"], "active")

    async def test_missing_user_returns_none(self) -> None:
        self._set_user_doc(None)
        result = await _get_user_from_token("valid-token")
        self.assertIsNone(result)

    async def test_no_token_returns_none(self) -> None:
        result = await _get_user_from_token(None)
        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
