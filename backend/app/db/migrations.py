"""
Lightweight startup-time schema migrations.

`Base.metadata.create_all` in `app.main.lifespan` only creates tables
that don't yet exist. It does NOT add columns to existing tables.
That meant that every time a new field was added to a model after
the table already existed in production (e.g. `is_admin`,
`mfa_secret`, `mfa_backup_codes`, the `deletion_*` GDPR fields), the
live DB would silently drift out of sync with the model — and the
next INSERT into that table would 500 with a "column does not exist"
Postgres error.

This module runs idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
statements on startup, which:

  * Self-heal: a deploy after the model change will bring the live
    DB up to date on first run.
  * Are safe to re-run: `IF NOT EXISTS` makes the migration a no-op
    on subsequent deploys.
  * Don't require a full migration tool (alembic) — this codebase
    uses `create_all` only.

The list of columns here MUST be kept in sync with `app/models/database.py`.
When you add a column to a model after the table has shipped to prod,
add an `ADD COLUMN IF NOT EXISTS` line for it here.

Limitations:
  * These are additive only. Renames / type changes / drops still
    need manual SQL.
  * We do NOT run destructive migrations from app code. If you need
    to drop or alter a column, do it manually in a maintenance
    window.
"""

from __future__ import annotations

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

logger = structlog.get_logger()


# Each entry: (table_name, column_name, column_definition)
# column_definition is the full SQL fragment AFTER the column name
# (type, defaults, constraints). Postgres 9.6+ supports
# `ADD COLUMN IF NOT EXISTS` so this is safe to run repeatedly.
ADDITIVE_MIGRATIONS: list[tuple[str, str, str]] = [
    # PR #6 — admin gate (admin-token bootstrap scripts)
    ("users", "is_admin", "BOOLEAN NOT NULL DEFAULT FALSE"),
    # PR #5 — 2FA / TOTP
    ("users", "is_mfa_enabled", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("users", "mfa_secret", "VARCHAR(255)"),
    ("users", "mfa_backup_codes", "JSONB"),
    # PR #5/6 — session tracking + GDPR deletion flow
    ("users", "last_login_at", "TIMESTAMP WITH TIME ZONE"),
    ("users", "deletion_requested_at", "TIMESTAMP WITH TIME ZONE"),
    ("users", "deletion_scheduled_at", "TIMESTAMP WITH TIME ZONE"),
    ("users", "deletion_id", "VARCHAR(255)"),
    ("users", "deletion_reason", "TEXT"),
]


async def run_additive_migrations(conn: AsyncConnection) -> None:
    """Apply every entry in ADDITIVE_MIGRATIONS. Failures are logged
    and skipped so a single bad migration doesn't take the service
    down — the operator can fix the SQL and redeploy."""
    applied = 0
    skipped = 0
    failed = 0
    for table, column, definition in ADDITIVE_MIGRATIONS:
        # SQLAlchemy's `text()` parameterises identifiers if you bind
        # them, but table/column names can't be parameterised (Postgres
        # doesn't allow $1 as a column name). We interpolate them
        # after a strict whitelist check on the format — table and
        # column names here are author-controlled, never user input.
        assert table.replace("_", "").isalnum(), f"bad table name: {table}"
        assert column.replace("_", "").isalnum(), f"bad column name: {column}"
        sql = (
            f'ALTER TABLE "{table}" ' f"ADD COLUMN IF NOT EXISTS {column} {definition}"
        )
        try:
            await conn.execute(text(sql))
            applied += 1
        except Exception as e:  # noqa: BLE001
            # Don't take the whole service down for a single bad
            # column. Log loudly so it shows up in Sentry / dashboards.
            logger.error(
                "startup_migration_failed",
                table=table,
                column=column,
                error=str(e),
            )
            failed += 1
            continue
        logger.info("startup_migration_applied", table=table, column=column)

    logger.info(
        "startup_migrations_done",
        applied=applied,
        skipped=skipped,
        failed=failed,
    )
