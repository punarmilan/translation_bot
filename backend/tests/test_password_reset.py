"""Tests for the end-to-end password-reset flow (P0 hardening item):
POST /auth/forgot-password now generates a hashed, expiring, one-time-use
token (app/repositories/password_reset_repository.py) instead of only
logging a request, and a new POST /auth/reset-password consumes it.

Following this test module's established convention (test_public_branding.py,
test_disabled_user_auth.py): call the route functions directly with
app.auth.router.get_db patched to a small in-memory fake, rather than a real
MongoDB or a TestClient.

There is no email/SMTP integration anywhere in this repository's
dependencies, so the raw token is never returned by the API -- these tests
recover it the same way a real delivery channel eventually would: by
patching generate_password_reset_token() to a known value for the
forgot-password call, then using that same raw value against
/auth/reset-password.
"""

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from bson import ObjectId
from fastapi import HTTPException
from pydantic import ValidationError

from app.auth.router import (
    ForgotPasswordRequest,
    ResetPasswordRequest,
    forgot_password,
    password_reset_rate_limiter,
    reset_password,
)
from app.auth.service import hash_password, hash_reset_token, verify_password
from app.repositories.password_reset_repository import PasswordResetRepository
from app.repositories.user_repository import UserRepository


class FakeCollection:
    def __init__(self) -> None:
        self.docs: dict[ObjectId, dict] = {}

    async def insert_one(self, document: dict):
        doc = dict(document)
        doc.setdefault("_id", ObjectId())
        self.docs[doc["_id"]] = doc

        class _Result:
            inserted_id = doc["_id"]

        return _Result()

    async def find_one(self, filt: dict):
        for doc in self.docs.values():
            if self._matches(doc, filt):
                return dict(doc)
        return None

    async def update_one(self, filt: dict, update: dict) -> None:
        for doc in self.docs.values():
            if self._matches(doc, filt):
                self._apply(doc, update)
                return

    async def update_many(self, filt: dict, update: dict) -> None:
        for doc in self.docs.values():
            if self._matches(doc, filt):
                self._apply(doc, update)

    @staticmethod
    def _matches(doc: dict, filt: dict) -> bool:
        for key, expected in filt.items():
            actual = doc.get(key)
            if isinstance(expected, dict) and "$in" in expected:
                if actual not in expected["$in"]:
                    return False
            elif actual != expected:
                return False
        return True

    @staticmethod
    def _apply(doc: dict, update: dict) -> None:
        for op, values in update.items():
            if op == "$set":
                doc.update(values)


class FakeDb(dict):
    def __getitem__(self, key):
        return self.setdefault(key, FakeCollection())


class FakeRequest:
    class _Client:
        host = "203.0.113.10"

    client = _Client()


class PasswordResetFlowTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.db = FakeDb()
        self.user_repo = UserRepository(self.db)
        self.reset_repo = PasswordResetRepository(self.db)

        self.patch_get_db = patch("app.auth.router.get_db", return_value=self.db)
        self.patch_get_db.start()
        self.addCleanup(self.patch_get_db.stop)

        # The limiter is a module-level singleton shared across the process;
        # clear it so no other test's attempts leak into this one.
        password_reset_rate_limiter._failed_attempts.clear()

        self.user = await self.user_repo.create(
            name="Reset Target",
            email="reset-target@example.com",
            password_hash=hash_password("OriginalPass1"),
        )

    async def _create_valid_token(self, raw_token: str, *, minutes_from_now: int = 30) -> None:
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=minutes_from_now)
        await self.reset_repo.create_token(str(self.user["_id"]), hash_reset_token(raw_token), expires_at)

    # --- forgot-password ---------------------------------------------------

    async def test_forgot_password_creates_a_token_for_an_existing_user(self) -> None:
        with patch("app.auth.router.generate_password_reset_token", return_value="known-raw-token"):
            result = await forgot_password(ForgotPasswordRequest(email=self.user["email"]), FakeRequest())

        self.assertIn("reset", result.message.lower())
        stored = await self.reset_repo.find_by_token_hash(hash_reset_token("known-raw-token"))
        self.assertIsNotNone(stored)
        self.assertEqual(stored["user_id"], str(self.user["_id"]))
        self.assertIsNone(stored["used_at"])
        self.assertGreater(stored["expires_at"], datetime.now(timezone.utc))

    async def test_forgot_password_returns_same_generic_message_for_unknown_email(self) -> None:
        known = await forgot_password(ForgotPasswordRequest(email=self.user["email"]), FakeRequest())
        password_reset_rate_limiter._failed_attempts.clear()
        unknown = await forgot_password(ForgotPasswordRequest(email="nobody@example.com"), FakeRequest())
        self.assertEqual(known.message, unknown.message)

    async def test_forgot_password_does_not_create_a_token_for_unknown_email(self) -> None:
        await forgot_password(ForgotPasswordRequest(email="nobody@example.com"), FakeRequest())
        self.assertEqual(len(self.db["password_reset_tokens"].docs), 0)

    async def test_forgot_password_invalidates_previous_tokens_on_new_request(self) -> None:
        with patch("app.auth.router.generate_password_reset_token", return_value="first-token"):
            await forgot_password(ForgotPasswordRequest(email=self.user["email"]), FakeRequest())
        password_reset_rate_limiter._failed_attempts.clear()
        with patch("app.auth.router.generate_password_reset_token", return_value="second-token"):
            await forgot_password(ForgotPasswordRequest(email=self.user["email"]), FakeRequest())

        first = await self.reset_repo.find_by_token_hash(hash_reset_token("first-token"))
        second = await self.reset_repo.find_by_token_hash(hash_reset_token("second-token"))
        self.assertIsNotNone(first["used_at"])
        self.assertIsNone(second["used_at"])

    async def test_forgot_password_rate_limits_repeated_requests_from_same_ip(self) -> None:
        for _ in range(5):
            await forgot_password(ForgotPasswordRequest(email=self.user["email"]), FakeRequest())
        with self.assertRaises(HTTPException) as ctx:
            await forgot_password(ForgotPasswordRequest(email=self.user["email"]), FakeRequest())
        self.assertEqual(ctx.exception.status_code, 429)

    # --- reset-password ------------------------------------------------

    async def test_valid_reset_changes_the_password(self) -> None:
        await self._create_valid_token("good-token")
        result = await reset_password(ResetPasswordRequest(token="good-token", new_password="BrandNewPass1"))
        self.assertIn("reset", result.message.lower())

        refreshed = await self.user_repo.get_by_id(str(self.user["_id"]))
        self.assertTrue(verify_password("BrandNewPass1", refreshed["password_hash"]))
        self.assertFalse(verify_password("OriginalPass1", refreshed["password_hash"]))

    async def test_valid_reset_consumes_the_token(self) -> None:
        await self._create_valid_token("single-use-token")
        await reset_password(ResetPasswordRequest(token="single-use-token", new_password="BrandNewPass1"))
        stored = await self.reset_repo.find_by_token_hash(hash_reset_token("single-use-token"))
        self.assertIsNotNone(stored["used_at"])

    async def test_reused_token_is_rejected(self) -> None:
        await self._create_valid_token("reuse-me")
        await reset_password(ResetPasswordRequest(token="reuse-me", new_password="FirstNewPass1"))
        with self.assertRaises(HTTPException) as ctx:
            await reset_password(ResetPasswordRequest(token="reuse-me", new_password="SecondNewPass1"))
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_expired_token_is_rejected(self) -> None:
        await self._create_valid_token("expired-token", minutes_from_now=-5)
        with self.assertRaises(HTTPException) as ctx:
            await reset_password(ResetPasswordRequest(token="expired-token", new_password="BrandNewPass1"))
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_unknown_token_is_rejected(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            await reset_password(ResetPasswordRequest(token="never-issued", new_password="BrandNewPass1"))
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_reset_for_disabled_user_is_rejected(self) -> None:
        await self.db["users"].update_one({"_id": self.user["_id"]}, {"$set": {"is_disabled": True}})
        await self._create_valid_token("disabled-user-token")
        with self.assertRaises(HTTPException) as ctx:
            await reset_password(ResetPasswordRequest(token="disabled-user-token", new_password="BrandNewPass1"))
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_invalid_password_is_rejected_by_schema_validation(self) -> None:
        with self.assertRaises(ValidationError):
            ResetPasswordRequest(token="whatever", new_password="short")


if __name__ == "__main__":
    unittest.main()
