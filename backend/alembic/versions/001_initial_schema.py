"""initial_schema

Revision ID: 001_initial
Revises:
Create Date: 2026-06-30 05:55:00.000000

Initial migration — creates all tables that match the SQLAlchemy
models in app/models/database.py, app/models/beta.py, and
app/models/waitlist.py (9 tables total).

This file was hand-written because autogenerate requires a live
PostgreSQL connection. It is functionally equivalent to what
`alembic revision --autogenerate -m "initial_schema"` would produce
against a fresh database.

Tables created:
  - users
  - user_sessions
  - documents
  - processing_tasks
  - usage_logs
  - plan_limits
  - beta_users
  - beta_waitlist
  - tool_waitlist
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── users ──────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True, index=True),
        sa.Column("password_hash", sa.String(255), nullable=True),
        sa.Column("full_name", sa.String(255), nullable=True),
        sa.Column("avatar_url", sa.Text, nullable=True),
        sa.Column(
            "status",
            sa.Enum("active", "suspended", "pending_verification", "deleted", name="userstatus"),
            nullable=False,
            server_default="pending_verification",
        ),
        sa.Column(
            "plan_tier",
            sa.Enum("free", "pro", "business", "enterprise", name="plantier"),
            nullable=False,
            server_default="free",
        ),
        sa.Column("is_email_verified", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_mfa_enabled", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_admin", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("mfa_secret", sa.String(255), nullable=True),
        sa.Column("mfa_backup_codes", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("oauth_provider", sa.String(50), nullable=True),
        sa.Column("oauth_id", sa.String(255), nullable=True),
        sa.Column("stripe_customer_id", sa.String(255), nullable=True),
        sa.Column("stripe_subscription_id", sa.String(255), nullable=True),
        sa.Column("deletion_requested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deletion_scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deletion_id", sa.String(255), nullable=True),
        sa.Column("deletion_reason", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
    )

    # ── user_sessions ──────────────────────────────────────
    op.create_table(
        "user_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_jti", sa.String(255), nullable=False, unique=True, index=True),
        sa.Column("device_info", sa.Text, nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )

    # ── documents ────────────────────────────────────────
    op.create_table(
        "documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("filename", sa.String(500), nullable=False),
        sa.Column("original_name", sa.String(500), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("file_size", sa.BigInteger, nullable=False),
        sa.Column("storage_key", sa.String(1000), nullable=False),
        sa.Column(
            "status",
            sa.Enum("uploading", "processing", "completed", "failed", "expired", name="documentstatus"),
            nullable=False,
            server_default="uploading",
        ),
        sa.Column("page_count", sa.Integer, nullable=True),
        sa.Column("extra_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("password_hash", sa.String(255), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── processing_tasks ─────────────────────────────────
    op.create_table(
        "processing_tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("task_type", sa.String(50), nullable=False),
        sa.Column("celery_task_id", sa.String(255), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("input_params", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("result_metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── usage_logs ────────────────────────────────────────
    op.create_table(
        "usage_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("file_size", sa.BigInteger, nullable=True),
        sa.Column("page_count", sa.Integer, nullable=True),
        sa.Column("processing_time_ms", sa.Integer, nullable=True),
        sa.Column("extra_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── plan_limits ────────────────────────────────────────
    op.create_table(
        "plan_limits",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "plan_tier",
            sa.Enum("free", "pro", "business", "enterprise", name="plantier"),
            nullable=False,
            unique=True,
        ),
        sa.Column("max_file_size_mb", sa.Integer, nullable=False, server_default=sa.text("10")),
        sa.Column("max_pages_per_file", sa.Integer, nullable=True),
        sa.Column("max_conversions_per_day", sa.Integer, nullable=False, server_default=sa.text("5")),
        sa.Column("max_storage_mb", sa.Integer, nullable=False, server_default=sa.text("100")),
        sa.Column("supports_ocr", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("supports_ai", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("supports_api", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("supports_team", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── beta_users ─────────────────────────────────────────
    op.create_table(
        "beta_users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("feedback_count", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("enrollment_source", sa.String(50), nullable=True),
    )

    # ── beta_waitlist ─────────────────────────────────────
    op.create_table(
        "beta_waitlist",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True, index=True),
        sa.Column("registered_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source", sa.String(50), nullable=True),
    )

    # ── tool_waitlist ─────────────────────────────────────
    op.create_table(
        "tool_waitlist",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("tool_id", sa.String(50), nullable=False),
        sa.Column("registered_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tool_waitlist")),
        sa.UniqueConstraint("email", "tool_id", name="uq_tool_waitlist_email_tool"),
    )


def downgrade() -> None:
    op.drop_table("tool_waitlist")
    op.drop_table("beta_waitlist")
    op.drop_table("beta_users")
    op.drop_table("plan_limits")
    op.drop_table("usage_logs")
    op.drop_table("processing_tasks")
    op.drop_table("documents")
    op.drop_table("user_sessions")
    op.drop_table("users")
    # Drop enum types created by PostgreSQL for our Enum columns.
    op.execute("DROP TYPE IF EXISTS documentstatus")
    op.execute("DROP TYPE IF EXISTS userstatus")
    op.execute("DROP TYPE IF EXISTS plantier")
