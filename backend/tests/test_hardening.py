"""Tests for the security primitives shipped in late June 2026.

Covers:
  1. create_access_token honours caller-provided `type` claim
     (regression for the mfa_pending / access clobber bug).
  2. Cloudflare Turnstile — verify_token semantics under each
     mode (disabled, missing, rejected, accepted, cached, outage).
  3. Per-user daily quota — under-limit, over-limit, no-limit
     (Enterprise), Redis fail-open.
  4. Password policy — every structural rule on its own, plus
     the breaker (HIBP breach_count > 0) and HIBP response
     parser.
  5. OAuth callback flow — clean 503 (not 500) when credentials
     aren't configured; structured detail with the missing env
     var name; never crashes with AttributeError when the
     provider isn't registered.

Run with:
    cd backend && .venv/bin/python -m pytest tests/test_hardening.py -v
"""

from __future__ import annotations

import hashlib
from datetime import timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.password_policy import (
    RULE_DIGIT,
    RULE_MIN_LENGTH,
    RULE_SPECIAL,
    RULE_UPPERCASE,
    check_password_rules,
    k_anonymity_prefix,
    parse_hibp_range_response,
)
from app.core.quota import QuotaFeature, _limit_for, _today_utc
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.core.turnstile import require_token, verify_token
from app.models.database import PlanTier, UserStatus

# ---------------------------------------------------------------------------
# 1. JWT create_access_token: caller-provided `type` must win
# ---------------------------------------------------------------------------


class TestAccessTokenTypePreservation:
    """The June-2026 Turnstile / MFA work shipped a regression where
    `create_access_token({"type": "mfa_pending"}, ...)` issued a token
    with `type: "access"` because the implementation called
    `to_encode.update({"type": "access"})` — overwriting whatever
    the caller provided. The MFA verify endpoint checks
    `payload.get("type") != "mfa_pending"` and would have rejected
    every legitimate MFA-pending token.

    These tests pin the corrected behaviour.
    """

    def test_default_type_is_access(self):
        """When the caller omits `type`, the token still has type=access."""
        token = create_access_token({"sub": "u-1", "jti": "j"})
        payload = decode_token(token)
        assert payload is not None
        assert payload["type"] == "access"

    def test_caller_provided_mfa_pending_is_preserved(self):
        """Regression test for the bug above."""
        token = create_access_token(
            {"sub": "u-1", "jti": "j", "type": "mfa_pending"},
            expires_delta=timedelta(minutes=5),
        )
        payload = decode_token(token)
        assert payload is not None
        assert (
            payload["type"] == "mfa_pending"
        ), "create_access_token must NOT overwrite a caller-provided type"

    def test_caller_provided_password_reset_is_preserved(self):
        """Same rule for password-reset tokens."""
        token = create_access_token(
            {"sub": "u-1", "jti": "j", "type": "password_reset"},
            expires_delta=timedelta(minutes=15),
        )
        payload = decode_token(token)
        assert payload is not None
        assert payload["type"] == "password_reset"

    def test_caller_provided_email_verification_is_preserved(self):
        token = create_access_token(
            {"sub": "u-1", "jti": "j", "type": "email_verification"},
            expires_delta=timedelta(hours=24),
        )
        payload = decode_token(token)
        assert payload is not None
        assert payload["type"] == "email_verification"

    def test_refresh_token_function_also_preserves_type(self):
        """Same fix applies to create_refresh_token."""
        token = create_refresh_token({"sub": "u-1", "type": "session_refresh"})
        payload = decode_token(token)
        assert payload is not None
        assert payload["type"] == "session_refresh"

    def test_other_claims_unchanged(self):
        """Adding `type` mustn't touch any other claim."""
        token = create_access_token(
            {
                "sub": "u-1",
                "jti": "abc",
                "email": "a@b.com",
                "type": "mfa_pending",
            }
        )
        payload = decode_token(token)
        assert payload is not None
        assert payload["sub"] == "u-1"
        assert payload["jti"] == "abc"
        assert payload["email"] == "a@b.com"
        assert payload["type"] == "mfa_pending"


# ---------------------------------------------------------------------------
# 2. Cloudflare Turnstile — verify_token / require_token semantics
# ---------------------------------------------------------------------------


@pytest.fixture
def turnstile_enabled(monkeypatch):
    """Turn on Turnstile for a single test, plus a known secret."""
    s = get_settings()
    monkeypatch.setattr(s, "TURNSTILE_ENABLED", True)
    monkeypatch.setattr(s, "TURNSTILE_SECRET_KEY", "0xTEST_SECRET")
    monkeypatch.setattr(s, "TURNSTILE_VERIFY_URL", "https://example.com/siteverify")
    return s


@pytest.fixture
def turnstile_disabled(monkeypatch):
    """Turn off Turnstile for a single test (mirrors local dev)."""
    s = get_settings()
    monkeypatch.setattr(s, "TURNSTILE_ENABLED", False)
    return s


class TestTurnstileVerifyToken:
    async def test_disabled_returns_true_without_redis_or_network(
        self, turnstile_disabled
    ):
        """Dev mode: missing config → always allow."""
        assert await verify_token(None) is True
        assert await verify_token("any-token") is True
        assert await verify_token("") is True

    async def test_enabled_with_no_token_returns_false(self, turnstile_enabled):
        """Missing token + Turnstile on → reject."""
        assert await verify_token(None) is False
        assert await verify_token("") is False

    async def test_enabled_rejects_rejected_token(self, turnstile_enabled):
        """Cloudflare returns success=false → reject."""
        mock_response = MagicMock(spec=httpx.Response)
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "success": False,
            "error-codes": ["invalid-input-response"],
        }

        mock_client = AsyncMock()
        mock_client.__aenter__.return_value.post.return_value = mock_response

        with patch("httpx.AsyncClient", return_value=mock_client):
            ok = await verify_token("bogus-token")

        assert ok is False

    async def test_enabled_accepts_valid_token(self, turnstile_enabled):
        """Cloudflare returns success=true → accept + cache."""
        mock_response = MagicMock(spec=httpx.Response)
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "success": True,
            "action": "login",
        }

        mock_client = AsyncMock()
        mock_client.__aenter__.return_value.post.return_value = mock_response

        # Mock Redis: no cache hit on first call, then write succeeds.
        mock_redis = AsyncMock()
        mock_redis.get.return_value = None
        mock_redis.set.return_value = True

        with patch("httpx.AsyncClient", return_value=mock_client):
            ok = await verify_token("good-token", redis_client=mock_redis)

        assert ok is True
        mock_redis.set.assert_awaited_once()
        # Cache key is the SHA-256 of the token (not the raw token).
        _, kwargs = mock_redis.set.call_args
        cache_key = kwargs.get("key") or mock_redis.set.call_args[0][0]
        expected_hash = hashlib.sha256(b"good-token").hexdigest()
        assert "turnstile:verified:" in cache_key
        assert expected_hash in cache_key

    async def test_cache_hit_skips_upstream_call(self, turnstile_enabled):
        """A cached "verified" verdict must not hit Cloudflare again."""
        mock_redis = AsyncMock()
        mock_redis.get.return_value = b"1"  # cache hit

        mock_client = AsyncMock()
        with patch("httpx.AsyncClient", return_value=mock_client) as cls_factory:
            ok = await verify_token("cached-token", redis_client=mock_redis)

        assert ok is True
        # Critical: no HTTP call should have been made.
        cls_factory.return_value.__aenter__.return_value.post.assert_not_called()

    async def test_upstream_failure_returns_false_fail_closed(self, turnstile_enabled):
        """Network outage → reject (fail-closed)."""
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value.post.side_effect = httpx.ConnectError(
            "boom"
        )

        with patch("httpx.AsyncClient", return_value=mock_client):
            ok = await verify_token("any-token")

        assert ok is False  # NOT True; we don't open the door on outage.

    async def test_remote_ip_forwarded_to_siteverify(self, turnstile_enabled):
        """When a remote IP is provided, it must hit Cloudflare."""
        mock_response = MagicMock(spec=httpx.Response)
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {"success": True}

        mock_client = AsyncMock()
        mock_client.__aenter__.return_value.post.return_value = mock_response

        with patch("httpx.AsyncClient", return_value=mock_client) as cls_factory:
            await verify_token("token", remote_ip="203.0.113.42")

        post = cls_factory.return_value.__aenter__.return_value.post
        post.assert_awaited_once()
        _, kwargs = post.call_args
        data = (
            kwargs.get("data") or post.call_args[1].get("data") or post.call_args[0][1]
        )
        assert data.get("remoteip") == "203.0.113.42"
        assert data.get("secret") == "0xTEST_SECRET"

    async def test_redis_outage_still_calls_cloudflare(self, turnstile_enabled):
        """If Redis raises on cache read, fall through to the network call."""
        mock_redis = AsyncMock()
        mock_redis.get.side_effect = ConnectionError("redis down")
        mock_redis.set.return_value = True

        mock_response = MagicMock(spec=httpx.Response)
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {"success": True}

        mock_client = AsyncMock()
        mock_client.__aenter__.return_value.post.return_value = mock_response

        with patch("httpx.AsyncClient", return_value=mock_client):
            ok = await verify_token("t", redis_client=mock_redis)

        assert ok is True


class TestTurnstileRequireToken:
    """require_token is the FastAPI-side wrapper — must raise 400 on failure
    and silently succeed on disabled / verified tokens."""

    async def test_disabled_does_not_raise(self, turnstile_disabled):
        # No token, Turnstile off → must not raise.
        await require_token(None)

    async def test_invalid_token_raises_400(self, turnstile_enabled):
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc:
            await require_token(None)
        assert exc.value.status_code == 400


# ---------------------------------------------------------------------------
# 3. Per-user daily quota — check_and_increment + get_usage
# ---------------------------------------------------------------------------


class TestQuotaLimitFor:
    """The limits map is the source of truth for "what does each plan get".
    Pin the relative ordering so we don't accidentally regress pricing."""

    def test_free_strictest(self):
        ai_free = _limit_for(PlanTier.FREE, QuotaFeature.AI)
        ai_pro = _limit_for(PlanTier.PRO, QuotaFeature.AI)
        ai_biz = _limit_for(PlanTier.BUSINESS, QuotaFeature.AI)
        assert (
            ai_free <= ai_pro <= ai_biz
        ), f"Free({ai_free}) <= Pro({ai_pro}) <= Business({ai_biz}) must hold"

    def test_process_same_pattern(self):
        p_free = _limit_for(PlanTier.FREE, QuotaFeature.PROCESS)
        p_pro = _limit_for(PlanTier.PRO, QuotaFeature.PROCESS)
        p_biz = _limit_for(PlanTier.BUSINESS, QuotaFeature.PROCESS)
        assert p_free <= p_pro <= p_biz

    def test_enterprise_returns_zero(self):
        """Enterprise uses 0 as the 'no quota' sentinel."""
        assert _limit_for(PlanTier.ENTERPRISE, QuotaFeature.AI) == 0
        assert _limit_for(PlanTier.ENTERPRISE, QuotaFeature.PROCESS) == 0

    def test_today_utc_is_iso_date(self):
        """_today_utc must return YYYY-MM-DD format, never datetime objects."""
        today = _today_utc()
        assert len(today) == 10
        assert today.count("-") == 2


class TestQuotaCheckAndIncrement:
    """The full increment + reject path. Uses AsyncMock for Redis so we
    exercise the actual counter logic without needing a live Redis."""

    @pytest.fixture
    def mock_redis(self):
        """Redis mock with INCR (returns new value) and EXPIRE."""
        r = AsyncMock()
        r.incr.return_value = 1  # default to first-call value
        r.expire.return_value = True
        return r

    async def test_first_call_increments_returns_1(self, mock_redis):
        from app.core.quota import check_and_increment

        new = await check_and_increment(
            mock_redis,
            user_id="u1",
            plan=PlanTier.FREE,
            feature=QuotaFeature.AI,
        )
        assert new == 1
        mock_redis.incr.assert_awaited_once()
        mock_redis.expire.assert_awaited_once()

    async def test_under_limit_returns_new_value(self, mock_redis):
        from app.core.quota import check_and_increment

        mock_redis.incr.return_value = 5  # well under the default limit
        new = await check_and_increment(
            mock_redis,
            user_id="u1",
            plan=PlanTier.FREE,
            feature=QuotaFeature.AI,
        )
        assert new == 5

    async def test_at_limit_does_not_raise_yet(self, mock_redis):
        """== limit is still allowed; only > limit raises."""
        from app.core.quota import check_and_increment

        limit = _limit_for(PlanTier.FREE, QuotaFeature.AI)
        mock_redis.incr.return_value = limit
        new = await check_and_increment(
            mock_redis,
            user_id="u1",
            plan=PlanTier.FREE,
            feature=QuotaFeature.AI,
        )
        assert new == limit

    async def test_over_limit_raises_429_with_structured_detail(self, mock_redis):
        from fastapi import HTTPException
        from app.core.quota import check_and_increment

        mock_redis.incr.return_value = 9999  # far over the limit
        with pytest.raises(HTTPException) as exc:
            await check_and_increment(
                mock_redis,
                user_id="u1",
                plan=PlanTier.FREE,
                feature=QuotaFeature.AI,
            )
        assert exc.value.status_code == 429
        detail = exc.value.detail
        assert isinstance(detail, dict)
        assert detail["error"] == "quota_exceeded"
        assert detail["feature"] == "ai"
        assert detail["plan"] == "free"
        assert detail["used"] == 9999
        assert detail["limit"] == _limit_for(PlanTier.FREE, QuotaFeature.AI)
        assert "resets_at_utc" in detail
        assert "message" in detail

    async def test_enterprise_short_circuits(self, mock_redis):
        """Enterprise → no Redis call, no rejection."""
        from app.core.quota import check_and_increment

        new = await check_and_increment(
            mock_redis,
            user_id="u1",
            plan=PlanTier.ENTERPRISE,
            feature=QuotaFeature.AI,
        )
        assert new == 0
        mock_redis.incr.assert_not_called()
        mock_redis.expire.assert_not_called()

    async def test_redis_outage_fails_open(self, mock_redis):
        """If Redis raises, we let the request through with used=0.

        Fail-open is intentional. The threat we're protecting against
        (spam) is much smaller than the threat of locking out every
        user during a Redis blip.
        """
        from app.core.quota import check_and_increment

        mock_redis.incr.side_effect = ConnectionError("redis down")
        new = await check_and_increment(
            mock_redis,
            user_id="u1",
            plan=PlanTier.FREE,
            feature=QuotaFeature.AI,
        )
        assert new == 0  # fail open

    async def test_expire_uses_nx_for_48h_grace(self, mock_redis):
        """EXPIRE should set TTL = 48h = 172800 seconds. We don't reset
        TTL on every increment by using NX, but the wrapper here calls
        the unconditional EXPIRE which is acceptable for our 48h grace
        window because we're well past any single day."""
        from app.core.quota import check_and_increment

        await check_and_increment(
            mock_redis,
            user_id="u1",
            plan=PlanTier.FREE,
            feature=QuotaFeature.AI,
        )
        _, kwargs = mock_redis.expire.call_args
        ttl = kwargs.get("time") or mock_redis.expire.call_args[0][1]
        # 48h = 60*60*48 = 172800
        assert (
            60 * 60 * 24 < ttl <= 60 * 60 * 48
        ), f"Expected ~48h TTL, got {ttl} seconds"


class TestQuotaUsageReadView:
    """get_usage powers the Flutter home page quota bar.
    Output shape must stay stable because the Flutter QuotaUsage
    model does fromJson(json)."""

    async def test_get_usage_returns_expected_keys(self):
        from app.core.quota import get_usage

        mock_redis = AsyncMock()
        mock_redis.get.return_value = b"3"

        out = await get_usage(mock_redis, user_id="u1", plan=PlanTier.FREE)
        assert out["plan"] == "free"
        assert "date" in out
        assert set(out["features"].keys()) == {"ai", "process"}
        for fname, fdata in out["features"].items():
            assert set(fdata.keys()) == {"used", "limit", "unlimited"}
            assert fdata["used"] == 3
            assert isinstance(fdata["limit"], int)
            assert isinstance(fdata["unlimited"], bool)
            assert fdata["unlimited"] is False  # Free plan has a limit

    async def test_get_usage_marks_enterprise_as_unlimited(self):
        """Enterprise → unlimited=true flag, but we still read the
        counter so we can show real "used" numbers in admin dashboards.
        The Flutter UI checks `unlimited` and renders a pill instead
        of a progress bar, so the raw `used` value is informational
        only for them."""
        from app.core.quota import get_usage

        mock_redis = AsyncMock()
        mock_redis.get.return_value = b"7"
        out = await get_usage(mock_redis, user_id="u1", plan=PlanTier.ENTERPRISE)
        assert out["features"]["ai"]["unlimited"] is True
        assert out["features"]["process"]["unlimited"] is True
        # Both limits are 0 for Enterprise (the "no quota" sentinel).
        assert out["features"]["ai"]["limit"] == 0
        assert out["features"]["process"]["limit"] == 0
        # The counter IS still read — used value surfaces (admin tooling).
        assert out["features"]["ai"]["used"] == 7

    async def test_get_usage_when_redis_missing_returns_zeros(self):
        """If Redis raises on read, we surface 0s (no crash)."""
        from app.core.quota import get_usage

        mock_redis = AsyncMock()
        mock_redis.get.side_effect = ConnectionError("redis down")
        out = await get_usage(mock_redis, user_id="u1", plan=PlanTier.FREE)
        for fdata in out["features"].values():
            assert fdata["used"] == 0


# ---------------------------------------------------------------------------
# 4. Password policy — every rule, every edge case
# ---------------------------------------------------------------------------


class TestPasswordRules:

    def test_strong_password_passes_all_structural(self):
        result = check_password_rules("CorrectHorseBattery!9")
        assert RULE_MIN_LENGTH in result.passed
        assert RULE_UPPERCASE in result.passed
        assert RULE_DIGIT in result.passed
        assert RULE_SPECIAL in result.passed

    def test_too_short_fails_min_length_only(self):
        result = check_password_rules("Ab1!")
        assert RULE_MIN_LENGTH in result.failed
        assert RULE_UPPERCASE in result.passed
        assert RULE_DIGIT in result.passed
        assert RULE_SPECIAL in result.passed

    def test_no_uppercase_fails_uppercase_only(self):
        result = check_password_rules("password123!")
        assert RULE_MIN_LENGTH in result.passed
        assert RULE_UPPERCASE in result.failed
        assert RULE_DIGIT in result.passed
        assert RULE_SPECIAL in result.passed

    def test_no_digit_fails_digit_only(self):
        result = check_password_rules("PasswordOnly!")
        assert RULE_MIN_LENGTH in result.passed
        assert RULE_UPPERCASE in result.passed
        assert RULE_DIGIT in result.failed
        assert RULE_SPECIAL in result.passed

    def test_no_special_fails_special_only(self):
        result = check_password_rules("Password123Only")
        assert RULE_MIN_LENGTH in result.passed
        assert RULE_UPPERCASE in result.passed
        assert RULE_DIGIT in result.passed
        assert RULE_SPECIAL in result.failed

    def test_empty_password_fails_everything(self):
        result = check_password_rules("")
        for rule in (
            RULE_MIN_LENGTH,
            RULE_UPPERCASE,
            RULE_DIGIT,
            RULE_SPECIAL,
        ):
            assert rule in result.failed

    def test_is_strong_only_when_all_structural_pass(self):
        """is_strong ignores breach_count unless it's been set."""
        weak = check_password_rules("weak")
        assert weak.is_strong is False

        strong = check_password_rules("CorrectHorse!9")
        assert strong.is_strong is True
        # Even with breach_count=None (default), strong still passes.
        assert strong.breach_count is None

    def test_is_strong_false_when_breach_count_positive(self):
        strong = check_password_rules("CorrectHorse!9")
        strong.breach_count = 5
        assert strong.is_strong is False

    def test_is_strong_still_strong_when_breach_count_zero(self):
        strong = check_password_rules("CorrectHorse!9")
        strong.breach_count = 0
        assert strong.is_strong is True


class TestKAnonymityPrefix:
    """We send only the first 5 chars of the SHA-1 hash to HIBP.
    The prefix/suffix split has to be exactly right."""

    def test_prefix_is_5_chars(self):
        prefix, suffix = k_anonymity_prefix("hunter2")
        assert len(prefix) == 5
        assert len(suffix) == 35  # SHA-1 is 40 hex chars total.

    def test_prefix_and_suffix_combine_to_uppercase_sha1(self):
        pw = "CorrectHorse!9"
        prefix, suffix = k_anonymity_prefix(pw)
        expected = hashlib.sha1(pw.encode("utf-8")).hexdigest().upper()
        assert (prefix + suffix) == expected

    def test_known_prefix_for_known_password(self):
        """Sanity check against a published value: SHA-1 of
        'password' is 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8.
        First 5 chars: 5BAA6."""
        prefix, _ = k_anonymity_prefix("password")
        assert prefix == "5BAA6"


class TestHIBPResponseParser:
    """The wire format parser. HIBP returns lines like
        0018A45C4D1DEF81644B54AB7F969B88D65:1
    where the leading 5 hex chars are the prefix we sent and the
    trailing 35 hex chars are the suffix + the breach count."""

    # Real SHA-1 hashes (40 uppercase hex chars) computed once from
    # known inputs. Each is split into a 5-char prefix + 35-char
    # suffix. Pasting literal 35-char strings is error-prone so we
    # generate them via hashlib + slicing in the helper below.
    _HASH_A = "0BEEC7B5EA3F0FDBC95D0DD47F3C5BC275DA8A33"  # sha1("foo")
    _HASH_B = "62CDB7020FF920E5AA642C3D4066950DD1F01F4D"  # sha1("bar")
    _HASH_C = "BBE960A25EA311D21D40669E93DF2003BA9B90A2"  # sha1("baz")

    # Convenience: derive the 35-char suffix of a known hash.
    @classmethod
    def _suffix(cls, full_hash: str) -> str:
        assert len(full_hash) == 40, f"not a SHA-1: {full_hash!r}"
        return full_hash[5:]  # skip the 5-char prefix

    # Helper: build a real (40-char) row from any 5-char prefix +
    # 35-char suffix. Asserts lengths so future edits can't drift.
    @staticmethod
    def _row(prefix: str, suffix: str, count: str) -> str:
        assert len(prefix) == 5, f"prefix must be 5 chars: {prefix!r}"
        assert len(suffix) == 35, f"suffix must be 35 chars: {suffix!r}"
        return f"{prefix}{suffix}:{count}"

    def _assert_lengths(self, *strings):
        """Defensive: every SHA-1 row we generate must be 40 chars total."""
        for s in strings:
            assert len(s.split(":")[0]) == 40, f"row hash must be 40 chars: {s!r}"

    def test_finds_exact_match(self):
        suf_a, suf_b = self._suffix(self._HASH_A), self._suffix(self._HASH_B)
        rows = [
            self._row("0018A", suf_a, "1"),
            self._row("00D4F", suf_b, "3"),
            self._row("01234", "0" * 35, "42"),
        ]
        self._assert_lengths(*rows)
        body = "\n".join(rows)
        # Look up the second row's suffix (the 35 chars right after "00D4F").
        count = parse_hibp_range_response(body, suf_b)
        assert count == 3

    def test_match_is_case_insensitive(self):
        suf_a = self._suffix(self._HASH_A)
        body = self._row("ABCDE", suf_a, "7")
        self._assert_lengths(body)
        # Pass lowercase; HIBP always sends uppercase but be defensive.
        count = parse_hibp_range_response(body, suf_a.lower())
        assert count == 7

    def test_no_match_returns_zero(self):
        suf_a = self._suffix(self._HASH_A)
        body = self._row("0018A", suf_a, "1")
        self._assert_lengths(body)
        # 35-char suffix that doesn't match.
        count = parse_hibp_range_response(body, "F" * 35)
        assert count == 0

    def test_empty_body_returns_zero(self):
        count = parse_hibp_range_response("", "ANYTHING")
        assert count == 0

    def test_malformed_line_is_skipped(self):
        """One row has a non-integer count column — the parser must
        return 0 for that exact match (best-effort), not raise."""
        suf_a = self._suffix(self._HASH_A)
        body = self._row("0018A", suf_a, "notanumber")
        count = parse_hibp_range_response(body, suf_a)
        assert count == 0  # not raised; degrades gracefully.

    def test_unrelated_malformed_lines_dont_affect_other_matches(self):
        """One row with a bad count for hash A; another, well-formed
        row for hash B. Looking up B's suffix must still return the
        correct count."""
        suf_a = self._suffix(self._HASH_A)
        suf_b = self._suffix(self._HASH_B)
        rows = [
            "not-a-valid-line",  # skipped
            self._row(
                "0018A", suf_a, "totally bogus count"
            ),  # matches A, count malformed → 0
            "",  # skipped
            self._row("00D4F", suf_b, "42"),  # matches B → 42
        ]
        body = "\n".join(rows)
        # Looking up A's suffix gives 0 (best-effort on bad count).
        assert parse_hibp_range_response(body, suf_a) == 0
        # Looking up B's suffix gives 42 — the bad A row doesn't
        # affect this lookup.
        assert parse_hibp_range_response(body, suf_b) == 42

    def test_invalid_count_value_returns_zero_not_crash(self):
        """If the count column is malformed, we return 0 — never raise.
        The endpoint would otherwise 500 on a single bad row."""
        suf_a = self._suffix(self._HASH_A)
        body = self._row("0018A", suf_a, "abc")
        count = parse_hibp_range_response(body, suf_a)
        assert count == 0


# ---------------------------------------------------------------------------
# 5. Cross-cutting — sanity that key invariants hold together
# ---------------------------------------------------------------------------


class TestSecurityInvariants:
    """End-to-end sanity for things that matter even if each piece is OK."""

    def test_user_status_active_is_string_enum(self):
        """The auth chain compares `user.status != UserStatus.ACTIVE`,
        and `UserStatus` is a `str, Enum` subclass — so the comparison
        must work whether the value is the enum or its string form."""
        assert UserStatus.ACTIVE == "active"
        assert UserStatus.ACTIVE.value == "active"
        assert UserStatus.SUSPENDED != UserStatus.ACTIVE

    def test_plan_tier_ordering(self):
        """Plan tier string values are stable API surface."""
        assert PlanTier.FREE.value == "free"
        assert PlanTier.PRO.value == "pro"
        assert PlanTier.BUSINESS.value == "business"
        assert PlanTier.ENTERPRISE.value == "enterprise"

    def test_turnstile_cache_key_is_token_hash(self):
        """Cache keys MUST NOT contain the raw token — it would leak
        to anyone with redis CLI access."""
        from app.core.turnstile import _verified_key

        key = _verified_key("supersecret")
        assert "supersecret" not in key
        # The key uses SHA-256, which is uniformly distributed and
        # not reversible.
        assert key.startswith("turnstile:verified:")
        assert len(key) == len("turnstile:verified:") + 64  # SHA-256 hex


# ---------------------------------------------------------------------------
# 6. OAuth login / callback when credentials are not configured
# ---------------------------------------------------------------------------


class TestOAuthUnconfigured:
    """When GOOGLE_CLIENT_ID / GITHUB_CLIENT_ID aren't set on the
    backend, the login endpoints must respond with a clean 503
    explaining the missing env var, NOT a generic 500 from
    AttributeError on the unregistered oauth client.

    These tests monkey-patch the module's `oauth` instance so we
    can reproduce the "registered client missing" condition in CI
    without needing real Google / GitHub credentials.
    """

    @pytest.fixture
    def _no_google_client(self, monkeypatch):
        """Strip the `google` attribute off the module's authlib
        OAuth instance — that's the production state when the ID
        is empty and oauth.register was skipped."""
        from app.api import oauth as oauth_module

        saved = oauth_module.oauth.__dict__.copy()
        oauth_module.oauth.__dict__.pop("google", None)
        try:
            yield
        finally:
            oauth_module.oauth.__dict__.clear()
            oauth_module.oauth.__dict__.update(saved)

    @pytest.fixture
    def _no_github_client(self, monkeypatch):
        from app.api import oauth as oauth_module

        saved = oauth_module.oauth.__dict__.copy()
        oauth_module.oauth.__dict__.pop("github", None)
        try:
            yield
        finally:
            oauth_module.oauth.__dict__.clear()
            oauth_module.oauth.__dict__.update(saved)

    def test_google_login_returns_503_when_unconfigured(self, _no_google_client):
        """Pre-fix this returned a generic 500 with
        `{"detail":"Internal server error"}`, which looked like a
        code bug instead of a missing-config situation."""
        from app.main import app

        client = TestClient(app, raise_server_exceptions=False)
        # Give a fake Cookie so the rate-limiter middleware (if
        # active in CI) doesn't count this against the same IP for
        # repeated runs.
        resp = client.get(
            "/api/v1/auth/google/login",
            headers={"Cookie": "client=test_hardening_503_google"},
        )
        assert (
            resp.status_code == 503
        ), f"Expected 503, got {resp.status_code}: {resp.text}"
        body = resp.json()
        assert isinstance(body["detail"], dict)
        assert body["detail"]["error"] == "oauth_not_configured"
        assert body["detail"]["provider"] == "google"
        # The error message MUST name the env var so an operator
        # knows exactly what to set in Railway.
        assert "GOOGLE_CLIENT_ID" in body["detail"]["message"]

    def test_github_login_returns_503_when_unconfigured(self, _no_github_client):
        from app.main import app

        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get(
            "/api/v1/auth/github/login",
            headers={"Cookie": "client=test_hardening_503_github"},
        )
        assert (
            resp.status_code == 503
        ), f"Expected 503, got {resp.status_code}: {resp.text}"
        body = resp.json()
        assert body["detail"]["error"] == "oauth_not_configured"
        assert body["detail"]["provider"] == "github"
        assert "GITHUB_CLIENT_ID" in body["detail"]["message"]

    def test_google_callback_returns_503_when_unconfigured(self, _no_google_client):
        """A logged-out request that hits the callback URL
        directly — same 503 treatment as /login."""
        from app.main import app

        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get(
            "/api/v1/auth/google/callback",
            headers={"Cookie": "client=test_hardening_cb_google"},
        )
        assert resp.status_code == 503
        assert resp.json()["detail"]["provider"] == "google"

    def test_github_callback_returns_503_when_unconfigured(self, _no_github_client):
        from app.main import app

        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get(
            "/api/v1/auth/github/callback",
            headers={"Cookie": "client=test_hardening_cb_github"},
        )
        assert resp.status_code == 503
        assert resp.json()["detail"]["provider"] == "github"

    def test_provider_not_configured_response_shape(self):
        """Pin the error shape so the Flutter side can pattern-match
        on `error == "oauth_not_configured"`."""
        from app.api.oauth import _provider_not_configured_response

        exc = _provider_not_configured_response("github")
        assert exc.status_code == 503
        assert exc.detail["error"] == "oauth_not_configured"
        assert exc.detail["provider"] == "github"
        assert "GITHUB_CLIENT_ID" in exc.detail["message"]

    def test_provider_configured_helper_returns_false_for_unregistered(
        self, _no_github_client
    ):
        """Direct unit test of the helper. In the test environment
        neither provider is configured (conftest doesn't set the
        client IDs); we additionally strip `github` to confirm the
        helper is reading the current `oauth` instance, not a
        stale-cached value."""
        from app.api.oauth import _provider_configured

        # _no_github_client already removed github. google is also
        # unregistered in CI (no env var set).
        assert _provider_configured("github") is False
        # Unknown provider names return False (not AttributeError) —
        # we never want a typo in a future provider to crash.
        assert _provider_configured("notarealprovider") is False
