import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Boolean, DateTime, Integer, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.database import Base, User


class BetaUser(Base):
    __tablename__ = "beta_users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )

    # Beta program details
    enrolled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    beta_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    has_been_notified: Mapped[bool] = mapped_column(Boolean, default=False)

    # Feedback
    feedback_submitted: Mapped[bool] = mapped_column(Boolean, default=False)
    feedback_rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    feedback_text: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)

    # Usage tracking during beta
    total_files_processed: Mapped[int] = mapped_column(Integer, default=0)
    total_ai_requests: Mapped[int] = mapped_column(Integer, default=0)
    total_conversions: Mapped[int] = mapped_column(Integer, default=0)

    # Referral tracking
    referral_code: Mapped[Optional[str]] = mapped_column(
        String(50), unique=True, nullable=True
    )
    referred_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("beta_users.id"), nullable=True
    )
    referrals_count: Mapped[int] = mapped_column(Integer, default=0)

    # User relationship
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])


class BetaWaitlist(Base):
    __tablename__ = "beta_waitlist"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    full_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    company: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    use_case: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Status
    status: Mapped[str] = mapped_column(
        String(20), default="pending"
    )  # pending, approved, rejected
    position: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    approved_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Marketing
    source: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    utm_campaign: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
