"""Lightweight tool-notification waitlist.

Captures email + tool_id when a user expresses interest in a tool that's
still in the coming-soon phase. Used to send a "we just shipped X" email
when the tool goes live. Separate from the beta program waitlist in
`beta.py` — this one is tool-scoped and not gated on an enrollment cap.
"""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, DateTime, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.database import Base


class ToolWaitlist(Base):
    __tablename__ = "tool_waitlist"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    tool_id: Mapped[str] = mapped_column(String(100), nullable=False)

    # Optional context from the form
    note: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    source: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Lifecycle
    notified_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        # Same email can sign up for multiple tools, but not the same
        # tool twice. Lets the user update preferences without spamming.
        UniqueConstraint("email", "tool_id", name="uq_tool_waitlist_email_tool"),
    )
