from typing import AsyncGenerator

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
