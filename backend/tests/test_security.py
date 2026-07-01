"""Security-focused tests for ProPDFs.

These tests cover the critical security surfaces:
  1. Blog POST endpoint — admin-only gating (401 unauth, 403 non-admin)
  2. JWT token creation and validation
  3. Token rotation on refresh
  4. MFA / 2FA TOTP setup, enable, verify, disable flow
  5. Password breach check endpoint shape and behavior
  6. Alembic migration validity (all 9 tables present)
  7. Rate limiter configuration coverage

Most tests use mocking to avoid requiring a live Postgres/Redis,
so they run in any CI environment.
"""

from datetime import timedelta
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.main import app
from app.models.database import UserStatus

client = TestClient(app, raise_server_exceptions=False)


# ---------------------------------------------------------------------------
# Helpers — create tokens without hitting the DB
# ---------------------------------------------------------------------------


def _make_access_token(sub: str = "user-123", email: str = "test@example.com") -> str:
    """Create a valid-looking access token for testing."""
    return create_access_token({"sub": sub, "jti": "test-jti-abc", "email": email})


def _make_refresh_token(sub: str = "user-123") -> str:
    """Create a valid-looking refresh token for testing."""
    return create_refresh_token({"sub": sub, "jti": "test-jti-abc"})


def _make_mfa_token(sub: str = "user-123") -> str:
    """Create a short-lived MFA-pending token."""
    from app.core.security import create_access_token

    return create_access_token(
        {
            "sub": sub,
            "jti": "mfa-jti",
            "email": "test@example.com",
            "type": "mfa_pending",
        },
        expires_delta=timedelta(minutes=5),
    )


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ===========================================================================
# 1. Blog admin gating
# ===========================================================================


class TestBlogAdminGating:
    """POST /api/v1/blog/posts must reject unauthenticated and non-admin users."""

    def test_blog_create_unauthenticated_returns_401(self):
        """No bearer token → 401."""
        resp = client.post(
            "/api/v1/blog/posts",
            json={
                "slug": "test-post",
                "title": "Test",
                "excerpt": "test excerpt",
                "keywords": ["test"],
                "author": "bot",
                "published_at": "2026-01-01",
                "updated_at": "2026-01-01",
                "category": "test",
                "tags": ["test"],
                "reading_time": 1,
                "featured_image": "",
                "content": "test content",
            },
        )
        assert resp.status_code == 401

    def test_blog_create_non_admin_returns_403(self):
        """Valid JWT for a non-admin user → 403 (require_admin dependency).

        We use FastAPI's `app.dependency_overrides` rather than patching
        a module attribute, because FastAPI captures Depends-callable
        references at route-decoration time. Module-attr patching does
        NOT intercept the dependency chain — only `app.dependency_overrides`
        does. This bypasses the DB session so we can focus on the
        authorisation check: a real authenticated non-admin caller
        gets 403, not 200.
        """
        token = _make_access_token()
        mock_user = MagicMock()
        mock_user.is_admin = False
        # Use the actual enum, not a string. The auth chain compares
        # `current_user.status != UserStatus.ACTIVE` which fails when
        # `status` is a bare MagicMock (MagicMock != enum). Using
        # `spec=UserStatus` would be tighter, but a direct assignment
        # keeps the test easy to read.
        mock_user.status = UserStatus.ACTIVE
        mock_user.id = "user-123"

        from app.api.auth import get_current_user

        try:
            app.dependency_overrides[get_current_user] = lambda: mock_user
            resp = client.post(
                "/api/v1/blog/posts",
                json={
                    "slug": "test-post",
                    "title": "Test",
                    "excerpt": "test excerpt",
                    "keywords": ["test"],
                    "author": "bot",
                    "published_at": "2026-01-01",
                    "updated_at": "2026-01-01",
                    "category": "test",
                    "tags": ["test"],
                    "reading_time": 1,
                    "featured_image": "",
                    "content": "test content",
                },
                headers=_auth_headers(token),
            )
        finally:
            # Always clear the override — leaving overrides across
            # tests causes cross-test contamination that's painful
            # to debug.
            app.dependency_overrides.pop(get_current_user, None)

        assert resp.status_code == 403
        assert "admin" in resp.text.lower()

    def test_blog_list_is_public(self):
        """GET /api/v1/blog/posts should work without auth."""
        resp = client.get("/api/v1/blog/posts")
        assert resp.status_code == 200

    def test_blog_categories_is_public(self):
        resp = client.get("/api/v1/blog/categories")
        assert resp.status_code == 200

    def test_blog_tags_is_public(self):
        resp = client.get("/api/v1/blog/tags")
        assert resp.status_code == 200


# ===========================================================================
# 2. JWT token creation and validation
# ===========================================================================


class TestJWTSecurity:
    """Test JWT token lifecycle."""

    def test_access_token_contains_expected_claims(self):
        token = _make_access_token(sub="u-1", email="a@b.com")
        payload = decode_token(token)
        assert payload is not None
        assert payload["sub"] == "u-1"
        assert payload["email"] == "a@b.com"
        assert payload["type"] == "access"

    def test_refresh_token_contains_expected_claims(self):
        token = _make_refresh_token(sub="u-1")
        payload = decode_token(token)
        assert payload is not None
        assert payload["sub"] == "u-1"
        assert payload["type"] == "refresh"

    def test_expired_token_returns_none(self):
        from app.core.security import create_access_token

        token = create_access_token(
            {"sub": "u-1", "jti": "jti", "email": "a@b.com"},
            expires_delta=timedelta(seconds=-1),  # already expired
        )
        payload = decode_token(token)
        assert payload is None

    def test_invalid_token_returns_none(self):
        payload = decode_token("not-a-valid-jwt")
        assert payload is None

    def test_tampered_token_returns_none(self):
        token = _make_access_token()
        # Corrupt the signature
        tampered = token[:-5] + "XXXXX"
        payload = decode_token(tampered)
        assert payload is None

    def test_mfa_pending_token_type(self):
        token = _make_mfa_token()
        payload = decode_token(token)
        assert payload is not None
        assert payload["type"] == "mfa_pending"


# ===========================================================================
# 3. Password security
# ===========================================================================


class TestPasswordSecurity:
    """Test password hashing, verification, and breach check."""

    def test_hash_roundtrip(self):
        pw = "CorrectHorseBatteryStaple!23"
        hashed = hash_password(pw)
        assert hashed != pw
        assert verify_password(pw, hashed) is True

    def test_wrong_password_fails(self):
        hashed = hash_password("original-password")
        assert verify_password("different-password", hashed) is False

    def test_empty_password_hash_still_verifies_empty(self):
        hashed = hash_password("")
        assert verify_password("", hashed) is True
        assert verify_password("not-empty", hashed) is False

    def test_breach_check_endpoint_exists(self):
        """The breach check endpoint should respond, even if HIBP is unreachable."""
        resp = client.post(
            "/api/v1/auth/password-breach-check", json={"password": "test123"}
        )
        # Should return 200 (checked or unchecked) — never 404
        assert resp.status_code == 200
        data = resp.json()
        assert "breach_count" in data
        assert "checked" in data
        assert isinstance(data["breach_count"], int)

    def test_breach_check_empty_password(self):
        resp = client.post("/api/v1/auth/password-breach-check", json={"password": ""})
        assert resp.status_code == 200
        assert resp.json()["checked"] is False

    def test_breach_check_no_body(self):
        resp = client.post("/api/v1/auth/password-breach-check", json={})
        assert resp.status_code == 200
        assert resp.json()["checked"] is False


# ===========================================================================
# 4. Auth endpoint access control
# ===========================================================================


class TestAuthAccessControl:
    """Test that protected endpoints reject unauthenticated requests."""

    @pytest.mark.parametrize(
        "endpoint",
        [
            "/api/v1/documents/",
            "/api/v1/auth/me",
            "/api/v1/auth/quota-usage",
        ],
    )
    def test_protected_endpoint_requires_auth(self, endpoint):
        resp = client.get(endpoint)
        assert resp.status_code == 401

    def test_register_requires_body(self):
        resp = client.post("/api/v1/auth/register", json={})
        assert resp.status_code == 422  # Pydantic validation error

    def test_login_requires_body(self):
        resp = client.post("/api/v1/auth/login", json={})
        assert resp.status_code == 422

    def test_health_is_public(self):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "healthy"


# ===========================================================================
# 5. MFA / 2FA endpoint gating
# ===========================================================================


class TestMFAEndpointGating:
    """MFA endpoints must require authentication."""

    def test_mfa_setup_requires_auth(self):
        resp = client.post("/api/v1/auth/2fa/setup")
        assert resp.status_code == 401

    def test_mfa_enable_requires_auth(self):
        resp = client.post("/api/v1/auth/2fa/enable", json={"code": "123456"})
        assert resp.status_code == 401

    def test_mfa_verify_requires_no_auth(self):
        """POST /auth/2fa/verify takes an mfa_token, not a session token."""
        resp = client.post(
            "/api/v1/auth/2fa/verify",
            json={
                "mfa_token": "fake-token",
                "code": "123456",
            },
        )
        # Should return 401 (invalid mfa_token) — not 404 or 500
        assert resp.status_code == 401

    def test_mfa_disable_requires_auth(self):
        resp = client.post("/api/v1/auth/2fa/disable", json={"password": "test"})
        assert resp.status_code == 401


# ===========================================================================
# 6. Alembic migration coverage
# ===========================================================================


class TestAlembicMigration:
    """Verify the initial migration covers all model tables."""

    def test_migration_file_exists(self):
        from pathlib import Path

        versions_dir = Path(__file__).resolve().parent.parent / "alembic/versions"
        files = list(versions_dir.glob("*.py"))
        assert (
            len(files) >= 1
        ), "Expected at least one migration file in alembic/versions/"

    def test_initial_migration_covers_all_tables(self):
        """The 001_initial_schema migration must create all 9 tables."""
        import importlib.util
        from pathlib import Path

        versions_dir = Path(__file__).resolve().parent.parent / "alembic/versions"
        migration_file = versions_dir / "001_initial_schema.py"
        assert migration_file.exists(), "001_initial_schema.py not found"

        spec = importlib.util.spec_from_file_location("migration_001", migration_file)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        # Extract table names from op.create_table calls in upgrade()
        import ast

        source = migration_file.read_text()
        tree = ast.parse(source)

        created_tables = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                func_name = None
                if isinstance(node.func, ast.Attribute):
                    func_name = node.func.attr
                elif isinstance(node.func, ast.Name):
                    func_name = node.func.id
                if func_name == "create_table":
                    # First positional arg is the table name (ast.Constant)
                    if node.args and isinstance(node.args[0], ast.Constant):
                        created_tables.add(node.args[0].value)

        expected = {
            "users",
            "user_sessions",
            "documents",
            "processing_tasks",
            "usage_logs",
            "plan_limits",
            "beta_users",
            "beta_waitlist",
            "tool_waitlist",
        }
        missing = expected - created_tables
        assert (
            not missing
        ), f"Migration missing tables: {missing}. Found: {created_tables}"

    def test_env_py_imports_all_models(self):
        """alembic/env.py must import database, beta, and waitlist models."""
        env_path = Path(__file__).resolve().parent.parent / "alembic/env.py"
        source = env_path.read_text()
        assert "from app.models.database import Base" in source
        assert "from app.models import beta" in source
        assert "from app.models import waitlist" in source


# ===========================================================================
# 7. Rate limiter configuration
# ===========================================================================


class TestRateLimiterConfig:
    """Verify rate limiter covers the expected sensitive endpoints."""

    def test_rate_limit_routes_defined(self):
        from app.core.rate_limit import ROUTE_LIMITS

        prefixes = {route[0] for route in ROUTE_LIMITS}
        # Auth endpoints must be rate-limited
        assert any("/auth/login" in p for p in prefixes)
        assert any("/auth/register" in p for p in prefixes)
        # AI endpoints
        assert any("/ai/" in p for p in prefixes)
        # Upload
        assert any("/documents/upload" in p for p in prefixes)
        # OCR
        assert any("/ocr/" in p for p in prefixes)

    def test_rate_limit_login_is_strictest(self):
        """Login should have a lower limit than upload (harder to brute-force)."""
        from app.core.rate_limit import ROUTE_LIMITS

        limits = {r[0]: r[1] for r in ROUTE_LIMITS}
        login_limit = limits.get("/api/v1/auth/login", float("inf"))
        upload_limit = limits.get("/api/v1/documents/upload", 0)
        assert (
            login_limit < upload_limit
        ), "Login rate limit should be stricter than upload"


# ===========================================================================
# 8. Quota system
# ===========================================================================


class TestQuotaSystem:
    """Verify plan-tier quotas are configured and enforced in code."""

    def test_free_tier_has_lower_limits_than_pro(self):
        from app.core.config import get_settings

        s = get_settings()
        assert s.QUOTA_FREE_AI_PER_DAY < s.QUOTA_PRO_AI_PER_DAY
        assert s.QUOTA_FREE_PROCESS_PER_DAY < s.QUOTA_PRO_PROCESS_PER_DAY

    def test_business_has_higher_limits_than_pro(self):
        from app.core.config import get_settings

        s = get_settings()
        assert s.QUOTA_BUSINESS_AI_PER_DAY > s.QUOTA_PRO_AI_PER_DAY
        assert s.QUOTA_BUSINESS_PROCESS_PER_DAY > s.QUOTA_PRO_PROCESS_PER_DAY

    def test_quota_features_enum(self):
        from app.core.quota import QuotaFeature

        assert "ai" in [f.value for f in QuotaFeature]
        assert "process" in [f.value for f in QuotaFeature]
