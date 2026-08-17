"""Regression test for Phase 10: removing a key from FEATURE_FLAG_DEFAULTS
only stops seeding new documents -- any flag document already persisted
from before the change stays in Mongo forever otherwise. main.py's
_cleanup_deprecated_feature_flags() deletes the specific keys that were
consolidated into meeting_policy, once, idempotently, on startup.
"""

import unittest
from unittest.mock import AsyncMock, MagicMock

from app.main import _cleanup_deprecated_feature_flags, _DEPRECATED_FEATURE_FLAG_KEYS


class FeatureFlagCleanupTest(unittest.IsolatedAsyncioTestCase):
    async def test_deletes_only_the_deprecated_keys(self) -> None:
        mock_db = MagicMock()
        flags_collection = AsyncMock()
        mock_db.__getitem__.return_value = flags_collection

        await _cleanup_deprecated_feature_flags(mock_db)

        flags_collection.delete_many.assert_awaited_once_with({"key": {"$in": _DEPRECATED_FEATURE_FLAG_KEYS}})

    def test_deprecated_keys_match_what_was_removed_from_defaults(self) -> None:
        from app.routers.platform import FEATURE_FLAG_DEFAULTS
        current_keys = {item["key"] for item in FEATURE_FLAG_DEFAULTS}
        for deprecated_key in _DEPRECATED_FEATURE_FLAG_KEYS:
            self.assertNotIn(deprecated_key, current_keys)


if __name__ == "__main__":
    unittest.main()
