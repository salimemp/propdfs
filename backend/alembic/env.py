"""
Alembic migration environment.

IMPORTANT: All model modules must be imported here so that their
table definitions are registered on the Base.metadata before
``autogenerate`` runs. If you add a new model file, import it in
the block below.
"""
from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context
from app.core.config import get_settings

# ── Import ALL model modules so autogenerate sees every table ──
from app.models.database import Base          # users, user_sessions, documents, processing_tasks, usage_logs, plan_limits
from app.models import beta                  # beta_users, beta_waitlist
from app.models import waitlist              # tool_waitlist

settings = get_settings()
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

def _get_sync_db_url(url: str) -> str:
    """Strip asyncpg driver for sync SQLAlchemy engine (Celery, Alembic)."""
    if url.startswith("postgresql+asyncpg://"):
        return url.replace("postgresql+asyncpg://", "postgresql://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


# Override with env DATABASE_URL
config.set_main_option("sqlalchemy.url", _get_sync_db_url(settings.DATABASE_URL))


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
