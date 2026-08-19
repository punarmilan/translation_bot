"""Regression test for P1 hardening item 11: `create_access_token()` used to
hardcode a 15-minute expiry, ignoring `Settings.ACCESS_TOKEN_EXPIRE_MINUTES`
(default 60) entirely. It now reads the configured value, matching how
`create_refresh_token()` already read `Settings` for its own lifetime.
"""

import unittest
from datetime import datetime, timezone
from unittest.mock import patch

import jwt

from app.auth.service import create_access_token
from app.config import Settings


class AccessTokenExpiryTest(unittest.TestCase):
    def _decode_exp(self, token: str, secret: str) -> int:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        return payload["exp"]

    def test_access_token_uses_the_configured_lifetime(self) -> None:
        custom_settings = Settings(ACCESS_TOKEN_EXPIRE_MINUTES=42)
        with patch("app.auth.service.get_settings", return_value=custom_settings):
            before = datetime.now(timezone.utc)
            token = create_access_token("user-1", "alice", "participant")
            exp = self._decode_exp(token, custom_settings.JWT_SECRET)

        minutes_until_expiry = (datetime.fromtimestamp(exp, tz=timezone.utc) - before).total_seconds() / 60
        self.assertAlmostEqual(minutes_until_expiry, 42, delta=0.5)

    def test_changing_the_setting_changes_the_expiry(self) -> None:
        short_settings = Settings(ACCESS_TOKEN_EXPIRE_MINUTES=5)
        long_settings = Settings(ACCESS_TOKEN_EXPIRE_MINUTES=120)

        with patch("app.auth.service.get_settings", return_value=short_settings):
            short_token = create_access_token("user-1", "alice", "participant")
            short_exp = self._decode_exp(short_token, short_settings.JWT_SECRET)

        with patch("app.auth.service.get_settings", return_value=long_settings):
            long_token = create_access_token("user-1", "alice", "participant")
            long_exp = self._decode_exp(long_token, long_settings.JWT_SECRET)

        self.assertLess(short_exp, long_exp)


if __name__ == "__main__":
    unittest.main()
