"""Tool notification waitlist.

Public endpoint — no auth required, since users browsing coming-soon
pages aren't necessarily signed in yet. The unique constraint on
(email, tool_id) is the only spam guard, plus the standard rate limiter.
"""

from typing import Optional

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.waitlist import ToolWaitlist

router = APIRouter(prefix="/api/v1/waitlist", tags=["waitlist"])


class JoinToolWaitlistRequest(BaseModel):
    email: EmailStr
    tool_id: str = Field(..., min_length=1, max_length=100)
    note: Optional[str] = Field(None, max_length=500)
    source: Optional[str] = Field(None, max_length=100)


class JoinToolWaitlistResponse(BaseModel):
    message: str
    already_on_list: bool


@router.post(
    "/tools",
    response_model=JoinToolWaitlistResponse,
    status_code=status.HTTP_201_CREATED,
)
async def join_tool_waitlist(
    body: JoinToolWaitlistRequest,
    db: AsyncSession = Depends(get_db),
) -> JoinToolWaitlistResponse:
    """Join the notification list for a coming-soon tool.

    Idempotent on (email, tool_id): if the pair is already there, we
    return 201 with `already_on_list: true` instead of erroring. That
    matches the rest of the waitlist UX in the app.
    """
    existing = await db.execute(
        select(ToolWaitlist).where(
            ToolWaitlist.email == body.email.lower(),
            ToolWaitlist.tool_id == body.tool_id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        return JoinToolWaitlistResponse(
            message="You're already on the list for this tool — we'll "
            "ping you when it ships.",
            already_on_list=True,
        )

    entry = ToolWaitlist(
        email=body.email.lower(),
        tool_id=body.tool_id,
        note=body.note,
        source=body.source or "coming_soon_page",
    )
    db.add(entry)
    try:
        await db.commit()
    except IntegrityError:
        # Race condition: another request inserted the same (email, tool_id)
        # between our SELECT and INSERT. Treat as duplicate.
        await db.rollback()
        return JoinToolWaitlistResponse(
            message="You're already on the list for this tool.",
            already_on_list=True,
        )

    return JoinToolWaitlistResponse(
        message="You're on the list. We'll email you the moment this tool "
        "goes live.",
        already_on_list=False,
    )
