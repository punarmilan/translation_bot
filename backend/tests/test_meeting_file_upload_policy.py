"""Regression tests for Phase 8: the meeting file-upload route
(POST /api/meetings/{room_id}/files/upload in app/routes.py) enforcing
admin-configured max_file_size_mb / allowed_file_extensions (see
platform_settings/meeting_policy) instead of the previously hardcoded
25MB / fixed extension set, while preserving those exact values as the
fallback default when no admin override exists.
"""

import shutil
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.routes import upload_meeting_file


class FakeUploadFile:
    def __init__(self, filename: str, content: bytes, content_type: str = "application/octet-stream") -> None:
        self.filename = filename
        self.content_type = content_type
        self._content = content
        self._offset = 0

    async def read(self, size: int) -> bytes:
        chunk = self._content[self._offset:self._offset + size]
        self._offset += len(chunk)
        return chunk


def policy_patch(**overrides):
    from app.runtime_settings import runtime_settings
    values = dict(runtime_settings.meeting_policy)
    values.update(overrides)
    return patch("app.runtime_settings.runtime_settings.meeting_policy", values)


class MeetingFileUploadPolicyTest(unittest.IsolatedAsyncioTestCase):
    ROOM_ID = "phase8-file-upload-test-room"

    async def asyncSetUp(self) -> None:
        self.mock_db = MagicMock()
        files_collection = AsyncMock()
        files_collection.insert_one = AsyncMock(return_value=None)
        self.mock_db.__getitem__.return_value = files_collection
        self.patch_get_db = patch("app.routes.get_db", return_value=self.mock_db)
        self.patch_get_db.start()
        self.current_user = {"_id": "user-1", "username": "tester"}

    async def asyncTearDown(self) -> None:
        self.patch_get_db.stop()
        shutil.rmtree(f"uploads/{self.ROOM_ID}", ignore_errors=True)

    async def test_default_25mb_limit_matches_previous_hardcoded_behavior(self) -> None:
        oversized = b"x" * (26 * 1024 * 1024)
        upload = FakeUploadFile("big.pdf", oversized)
        with self.assertRaises(HTTPException) as ctx:
            await upload_meeting_file(self.ROOM_ID, upload, self.current_user)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("25MB", ctx.exception.detail)

    async def test_admin_configured_size_limit_is_enforced(self) -> None:
        with policy_patch(max_file_size_mb=1):
            oversized = b"x" * (2 * 1024 * 1024)
            upload = FakeUploadFile("small-limit.pdf", oversized)
            with self.assertRaises(HTTPException) as ctx:
                await upload_meeting_file(self.ROOM_ID, upload, self.current_user)
            self.assertEqual(ctx.exception.status_code, 400)
            self.assertIn("1MB", ctx.exception.detail)

    async def test_admin_configured_extension_allowlist_is_enforced(self) -> None:
        with policy_patch(allowed_file_extensions=[".pdf"]):
            upload = FakeUploadFile("image.png", b"data")
            with self.assertRaises(HTTPException) as ctx:
                await upload_meeting_file(self.ROOM_ID, upload, self.current_user)
            self.assertEqual(ctx.exception.status_code, 400)

    async def test_default_extension_allowlist_still_accepts_previously_supported_types(self) -> None:
        upload = FakeUploadFile("notes.pdf", b"data")
        result = await upload_meeting_file(self.ROOM_ID, upload, self.current_user)
        self.assertEqual(result["status"], "ok")


if __name__ == "__main__":
    unittest.main()
