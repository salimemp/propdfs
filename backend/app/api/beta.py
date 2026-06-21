import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

import structlog
from app.db.session import get_db
from app.models.database import User, PlanTier
from app.models.beta import BetaUser, BetaWaitlist
from app.api.auth import get_current_active_user
from app.core.config import get_settings

logger = structlog.get_logger()
router = APIRouter(prefix="/beta", tags=["Beta Program"])
settings = get_settings()

# Beta configuration
BETA_MAX_USERS = 100
BETA_DURATION_DAYS = 90


class BetaService:
    """Manage the beta launch program."""

    @staticmethod
    async def is_beta_full(db: AsyncSession) -> bool:
        result = await db.execute(
            select(func.count(BetaUser.id)).where(BetaUser.is_active.is_(True))
        )
        count = result.scalar()
        return count >= BETA_MAX_USERS

    @staticmethod
    async def get_remaining_slots(db: AsyncSession) -> int:
        result = await db.execute(
            select(func.count(BetaUser.id)).where(BetaUser.is_active.is_(True))
        )
        count = result.scalar()
        return max(0, BETA_MAX_USERS - count)

    @staticmethod
    async def enroll_user(db: AsyncSession, user: User) -> BetaUser:
        # Check if user is already enrolled
        result = await db.execute(select(BetaUser).where(BetaUser.user_id == user.id))
        existing = result.scalar_one_or_none()
        if existing:
            return existing

        # Generate referral code
        referral_code = f"PROP{user.id.hex[:8].upper()}"

        beta_user = BetaUser(
            user_id=user.id,
            beta_expires_at=datetime.now(timezone.utc)
            + timedelta(days=BETA_DURATION_DAYS),
            referral_code=referral_code,
        )

        # Upgrade user to PRO plan during beta
        user.plan_tier = PlanTier.PRO

        db.add(beta_user)
        await db.commit()
        await db.refresh(beta_user)

        logger.info(
            "beta_user_enrolled", user_id=str(user.id), referral_code=referral_code
        )
        return beta_user

    @staticmethod
    async def is_beta_active(db: AsyncSession, user_id: uuid.UUID) -> bool:
        result = await db.execute(
            select(BetaUser).where(
                BetaUser.user_id == user_id,
                BetaUser.is_active.is_(True),
                BetaUser.beta_expires_at > datetime.now(timezone.utc),
            )
        )
        beta_user = result.scalar_one_or_none()
        return beta_user is not None

    @staticmethod
    async def get_beta_status(db: AsyncSession, user_id: uuid.UUID) -> dict:
        result = await db.execute(select(BetaUser).where(BetaUser.user_id == user_id))
        beta_user = result.scalar_one_or_none()

        if not beta_user:
            return {"enrolled": False}

        days_remaining = (beta_user.beta_expires_at - datetime.now(timezone.utc)).days

        return {
            "enrolled": True,
            "active": beta_user.is_active,
            "enrolled_at": beta_user.enrolled_at,
            "expires_at": beta_user.beta_expires_at,
            "days_remaining": max(0, days_remaining),
            "referral_code": beta_user.referral_code,
            "referrals_count": beta_user.referrals_count,
            "total_files_processed": beta_user.total_files_processed,
            "total_ai_requests": beta_user.total_ai_requests,
            "total_conversions": beta_user.total_conversions,
        }


@router.get("/status")
async def get_public_beta_status(db: AsyncSession = Depends(get_db)):
    """Get public beta program status."""
    remaining = await BetaService.get_remaining_slots(db)
    total_waitlist = await db.execute(select(func.count(BetaWaitlist.id)))

    return {
        "is_active": True,
        "max_users": BETA_MAX_USERS,
        "remaining_slots": remaining,
        "waitlist_count": total_waitlist.scalar(),
        "beta_duration_days": BETA_DURATION_DAYS,
        "features_included": [
            "All PDF tools (merge, split, compress, rotate, etc.)",
            "Full conversion engine (30+ formats)",
            "OCR for scanned documents",
            "AI summarization & translation",
            "AI document chat & extraction",
            "Cloud storage integrations",
            "Team workspaces",
            "API access",
            "Priority support",
        ],
    }


@router.post("/enroll", status_code=status.HTTP_201_CREATED)
async def enroll_beta(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Enroll current user in beta program."""
    if await BetaService.is_beta_full(db):
        raise HTTPException(
            status_code=400, detail="Beta program is full. Join the waitlist instead."
        )

    beta_user = await BetaService.enroll_user(db, current_user)
    status_data = await BetaService.get_beta_status(db, current_user.id)

    return {
        "message": "Welcome to the ProPDFs Beta!",
        "status": status_data,
        "referral_code": beta_user.referral_code,
    }


@router.get("/my-status")
async def get_my_beta_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get current user's beta status."""
    return await BetaService.get_beta_status(db, current_user.id)


@router.post("/waitlist", status_code=status.HTTP_201_CREATED)
async def join_waitlist(
    email: str,
    full_name: Optional[str] = None,
    company: Optional[str] = None,
    use_case: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Join the beta waitlist."""
    # Check if already on waitlist or enrolled
    result = await db.execute(
        select(BetaWaitlist).where(BetaWaitlist.email == email.lower())
    )
    existing = result.scalar_one_or_none()
    if existing:
        return {
            "message": "You're already on the waitlist!",
            "position": existing.position,
        }

    # Get next position
    result = await db.execute(
        select(func.count(BetaWaitlist.id)).where(BetaWaitlist.status == "pending")
    )
    position = result.scalar() + 1

    waitlist_entry = BetaWaitlist(
        email=email.lower(),
        full_name=full_name,
        company=company,
        use_case=use_case,
        position=position,
    )
    db.add(waitlist_entry)
    await db.commit()

    logger.info("waitlist_joined", email=email, position=position)

    return {
        "message": "You've been added to the waitlist!",
        "position": position,
        "estimated_wait": "1-2 weeks" if position <= 50 else "2-4 weeks",
    }


@router.post("/feedback")
async def submit_beta_feedback(
    rating: int,
    feedback: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Submit beta feedback."""
    result = await db.execute(
        select(BetaUser).where(BetaUser.user_id == current_user.id)
    )
    beta_user = result.scalar_one_or_none()
    if not beta_user:
        raise HTTPException(status_code=404, detail="Not enrolled in beta program")

    beta_user.feedback_rating = rating
    beta_user.feedback_text = feedback
    beta_user.feedback_submitted = True
    await db.commit()

    logger.info("beta_feedback_submitted", user_id=str(current_user.id), rating=rating)

    return {"message": "Thank you for your feedback!"}


@router.post("/referral/{referral_code}")
async def use_referral_code(
    referral_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Apply a referral code."""
    result = await db.execute(
        select(BetaUser).where(BetaUser.referral_code == referral_code)
    )
    referrer = result.scalar_one_or_none()
    if not referrer:
        raise HTTPException(status_code=404, detail="Invalid referral code")

    if referrer.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot use your own referral code")

    # Check if current user is already enrolled
    result = await db.execute(
        select(BetaUser).where(BetaUser.user_id == current_user.id)
    )
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Already enrolled in beta")

    # Enroll with bonus days
    bonus_days = 14
    beta_user = BetaUser(
        user_id=current_user.id,
        beta_expires_at=datetime.now(timezone.utc)
        + timedelta(days=BETA_DURATION_DAYS + bonus_days),
        referred_by=referrer.id,
    )
    current_user.plan_tier = PlanTier.PRO

    # Update referrer count
    referrer.referrals_count += 1

    db.add(beta_user)
    await db.commit()

    logger.info(
        "referral_used", referrer=str(referrer.user_id), new_user=str(current_user.id)
    )

    return {
        "message": f"Referral applied! You get {BETA_DURATION_DAYS + bonus_days} days of beta access.",
        "bonus_days": bonus_days,
    }
