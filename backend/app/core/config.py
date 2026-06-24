from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    # App
    APP_NAME: str = "ProPDFs"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "development"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/propdfs"
    DATABASE_POOL_SIZE: int = 10

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # Security
    SECRET_KEY: str = "change-me-in-production-32-char-key!"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # File Storage (Cloudflare R2 / S3-compatible)
    STORAGE_ENDPOINT: str = ""
    STORAGE_ACCESS_KEY: str = ""
    STORAGE_SECRET_KEY: str = ""
    STORAGE_BUCKET: str = "propdfs-documents"
    STORAGE_REGION: str = "auto"
    MAX_FILE_SIZE_MB: int = 500

    # Payments (Stripe) — infrastructure-only. Subscription UI + checkout
    # flow intentionally not implemented yet; see Stripe references in
    # .env.example. Wire up via `app/api/billing.py` when ready.
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_PRICE_FREE: str = ""
    STRIPE_PRICE_PRO: str = ""
    STRIPE_PRICE_BUSINESS: str = ""

    # AI (OpenAI / Anthropic / Gemini)
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    GEMINI_API_KEY: str = ""

    # Bot protection — Cloudflare Turnstile
    # Site key is PUBLIC (shipped in the Flutter web bundle).
    # Secret key stays on the server. Both can be empty in dev —
    # Turnstile is bypassed when TURNSTILE_ENABLED is false (or
    # when the secret is empty). Production sets both via the env.
    TURNSTILE_ENABLED: bool = False
    TURNSTILE_SITE_KEY: str = ""
    TURNSTILE_SECRET_KEY: str = ""
    # Cloudflare's siteverify endpoint. Override only if you're
    # routing through a regional proxy.
    TURNSTILE_VERIFY_URL: str = (
        "https://challenges.cloudflare.com/turnstile/v0/siteverify"
    )
    # How long we cache a "verified" token server-side (seconds).
    # Same token can be re-used for a few minutes; caching stops
    # a single token from being spent across multiple requests.
    TURNSTILE_TOKEN_TTL_SECONDS: int = 180

    # Per-user daily quota (Redis-backed counters).
    # Quotas reset at 00:00 UTC. Each plan tier has its own ceiling.
    # Set the value to 0 to disable a particular plan's quota.
    QUOTA_FREE_AI_PER_DAY: int = 20
    QUOTA_FREE_PROCESS_PER_DAY: int = 50
    QUOTA_PRO_AI_PER_DAY: int = 200
    QUOTA_PRO_PROCESS_PER_DAY: int = 1000
    QUOTA_BUSINESS_AI_PER_DAY: int = 2000
    QUOTA_BUSINESS_PROCESS_PER_DAY: int = 10000

    # OAuth
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""

    # Observability — leave SENTRY_DSN empty to disable Sentry.
    SENTRY_DSN: str = ""

    # Frontend URL
    FRONTEND_URL: str = "http://localhost:3000"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
