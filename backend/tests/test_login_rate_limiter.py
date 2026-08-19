"""Tests for P1 hardening item 5 (login rate limiter audit): confirms the
existing block-after-N-failures/reset-on-success behavior, and the small,
in-process-only fix made during this pass -- an identifier whose attempts
have all aged out of the window is now dropped from the internal dict
entirely instead of leaving a permanent empty-list entry behind (unbounded
memory growth over process lifetime otherwise, one entry per distinct IP
that ever failed once).
"""

import unittest
from datetime import datetime, timedelta, timezone

from app.auth.router import LoginRateLimiter


class LoginRateLimiterTest(unittest.IsolatedAsyncioTestCase):
    async def test_blocks_after_the_configured_number_of_failures(self) -> None:
        limiter = LoginRateLimiter(limit=3, window_minutes=15)
        for _ in range(3):
            self.assertTrue(await limiter.check_rate_limit("1.2.3.4"))
            await limiter.record_failure("1.2.3.4")
        self.assertFalse(await limiter.check_rate_limit("1.2.3.4"))

    async def test_reset_clears_the_block(self) -> None:
        limiter = LoginRateLimiter(limit=1, window_minutes=15)
        await limiter.record_failure("1.2.3.4")
        self.assertFalse(await limiter.check_rate_limit("1.2.3.4"))
        await limiter.reset("1.2.3.4")
        self.assertTrue(await limiter.check_rate_limit("1.2.3.4"))

    async def test_different_identifiers_are_independent(self) -> None:
        limiter = LoginRateLimiter(limit=1, window_minutes=15)
        await limiter.record_failure("1.2.3.4")
        self.assertFalse(await limiter.check_rate_limit("1.2.3.4"))
        self.assertTrue(await limiter.check_rate_limit("5.6.7.8"))

    async def test_expired_attempts_are_dropped_from_memory_entirely(self) -> None:
        limiter = LoginRateLimiter(limit=5, window_minutes=15)
        limiter._failed_attempts["stale-ip"] = [datetime.now(timezone.utc) - timedelta(minutes=30)]

        await limiter.check_rate_limit("stale-ip")

        self.assertNotIn("stale-ip", limiter._failed_attempts)

    async def test_still_within_window_attempts_are_kept(self) -> None:
        limiter = LoginRateLimiter(limit=5, window_minutes=15)
        recent = datetime.now(timezone.utc) - timedelta(minutes=1)
        limiter._failed_attempts["recent-ip"] = [recent]

        await limiter.check_rate_limit("recent-ip")

        self.assertIn("recent-ip", limiter._failed_attempts)
        self.assertEqual(limiter._failed_attempts["recent-ip"], [recent])


if __name__ == "__main__":
    unittest.main()
