from typing import AsyncGenerator, Optional

from redis.asyncio import Redis, from_url as redis_from_url
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import get_settings

settings = get_settings()


def _get_async_db_url(url: str) -> str:
    """Rewrite Railway's postgres URL for async SQLAlchemy engine."""
    if url.startswith("postgresql+asyncpg://"):
        return url
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


engine = create_async_engine(
    _get_async_db_url(settings.DATABASE_URL),
    pool_size=settings.DATABASE_POOL_SIZE,
    max_overflow=20,
    pool_pre_ping=True,
    echo=settings.DEBUG,
    poolclass=None if settings.ENVIRONMENT == "production" else NullPool,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# --- Redis pool -------------------------------------------------------------
#
# Lazily constructed so the app can boot before Redis is reachable (e.g.
# during local Docker compose startup). The rate-limit middleware in
# `app/main.py` swallows Redis errors and fails open — see
# `RateLimitMiddleware` in `app/core/rate_limit.py`.

_redis_pool: Optional[Redis] = None


async def get_redis() -> Optional[Redis]:
    """Return a shared async Redis client, or None if REDIS_URL is unset.

    Returned object is process-global and reused across requests.
    """
    global _redis_pool
    if _redis_pool is not None:
        return _redis_pool
    if not settings.REDIS_URL:
        return None
    _redis_pool = redis_from_url(
        settings.REDIS_URL,
        encoding="utf-8",
        decode_responses=True,
        socket_connect_timeout=2,
        socket_timeout=2,
    )
    return _redis_pool
