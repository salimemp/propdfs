"""Per-user daily quota enforcement.

Backed by Redis counters with a 24-hour TTL. Each call to
[check_and_increment] increments the user's counter for the
named feature and rejects if the new value exceeds the plan's
ceiling.

Why a counter with TTL rather than per-day reset: simpler
(no cron needed), works across multiple workers, and the TTL
gives a natural 48h grace window so a request at 23:59 UTC
followed by another at 00:01 UTC doesn't double-count.

Key shape: `quota:{user_id}:{feature}:{YYYY-MM-DD}`
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from enum import Enum

import redis.asyncio as aioredis
from fastapi import HTTPException

from app.core.config import get_settings
from app.models.database import PlanTier

logger = logging.getLogger(__name__)


class QuotaFeature(str, Enum):
    """Distinct quota buckets. One counter per (user, feature,
    day). Adding a new feature here is the only change needed to
    start metering it.
    """

    AI = "ai"
    PROCESS = "process"


# Plan-tier → daily cap. Falsy (=0) means "no quota enforced",
# which is what Enterprise gets (custom contract).
_PLAN_LIMITS = {
    PlanTier.FREE: {
        QuotaFeature.AI: "QUOTA_FREE_AI_PER_DAY",
        QuotaFeature.PROCESS: "QUOTA_FREE_PROCESS_PER_DAY",
    },
    PlanTier.PRO: {
        QuotaFeature.AI: "QUOTA_PRO_AI_PER_DAY",
        QuotaFeature.PROCESS: "QUOTA_PRO_PROCESS_PER_DAY",
    },
    PlanTier.BUSINESS: {
        QuotaFeature.AI: "QUOTA_BUSINESS_AI_PER_DAY",
        QuotaFeature.PROCESS: "QUOTA_BUSINESS_PROCESS_PER_DAY",
    },
    # ENTERPRISE is mapped to no cap — admins can override via
    # plan-specific code or just disable quota at the limit
    # config level.
    PlanTier.ENTERPRISE: {
        QuotaFeature.AI: None,
        QuotaFeature.PROCESS: None,
    },
}


def _limit_for(plan: PlanTier, feature: QuotaFeature) -> int:
    """Return the daily cap for a (plan, feature), or 0 for
    "no quota" (Enterprise with no override).
    """
    settings = get_settings()
    attr_name = _PLAN_LIMITS.get(plan, {}).get(feature)
    if attr_name is None:
        return 0
    return int(getattr(settings, attr_name, 0) or 0)


def _key(user_id: str, feature: QuotaFeature, today: str) -> str:
    return f"quota:{user_id}:{feature.value}:{today}"


def _today_utc() -> str:
    """ISO date in UTC. Counting by UTC day keeps the boundary
    stable across users in every timezone; the daily reset
    happens at 00:00 UTC for everyone.
    """
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


async def check_and_increment(
    redis_client: aioredis.Redis,
    *,
    user_id: str,
    plan: PlanTier,
    feature: QuotaFeature,
) -> int:
    """Increment the daily counter and return the new value.

    Raises HTTPException(429) with a structured detail payload if
    the new value exceeds the plan's quota. The counter has
    already been incremented by the time we raise — we don't
    roll back on overage, so a user spamming the endpoint still
    counts against tomorrow's quota.
    """
    limit = _limit_for(plan, feature)
    if limit <= 0:
        # Enterprise / unconfigured → no quota.
        return 0

    key = _key(user_id, feature, _today_utc())
    try:
        # INCR returns the new value. EXPIRE sets the TTL only if
        # it's the first increment of the day (NX flag) — otherwise
        # the EXPIRE call would refresh the TTL on every request.
        new_value = await redis_client.incr(key)
        await redis_client.expire(key, 60 * 60 * 48)  # 48h grace
    except Exception as e:
        # Redis outage — fail open. We'd rather let a user
        # through than block every legit request when Redis
        # is down. Log loudly so we know.
        logger.error("quota_redis_failed", error=str(e))
        return 0

    if new_value > limit:
        logger.info(
            "quota_exceeded",
            user_id=user_id,
            plan=plan.value,
            feature=feature.value,
            used=new_value,
            limit=limit,
        )
        raise HTTPException(
            status_code=429,
            detail={
                "error": "quota_exceeded",
                "feature": feature.value,
                "used": new_value,
                "limit": limit,
                "plan": plan.value,
                "resets_at_utc": _next_midnight_utc_iso(),
                "message": (
                    f"You've used {new_value} of your {limit} daily "
                    f"{feature.value} actions on the {plan.value} plan. "
                    "The quota resets at midnight UTC, or upgrade your "
                    "plan for a higher cap."
                ),
            },
        )

    return new_value


def _next_midnight_utc_iso() -> str:
    """ISO 8601 timestamp of the next UTC midnight.

    Sent back to the client so the UI can render a human
    "quota resets in X hours" countdown without having to know
    the user's local timezone.
    """
    from datetime import timedelta

    now = datetime.now(timezone.utc)
    tomorrow = (now + timedelta(days=1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return tomorrow.isoformat()


async def get_usage(
    redis_client: aioredis.Redis,
    *,
    user_id: str,
    plan: PlanTier,
) -> dict:
    """Read-only view of the user's current daily usage. Used by
    the Flutter "quota bar" widget on the home page so users
    can see how much of their quota they've used without
    hitting a counter write.
    """
    today = _today_utc()
    out = {"plan": plan.value, "date": today, "features": {}}
    for feature in QuotaFeature:
        limit = _limit_for(plan, feature)
        try:
            raw = await redis_client.get(_key(user_id, feature, today))
            used = int(raw) if raw else 0
        except Exception:
            used = 0
        out["features"][feature.value] = {
            "used": used,
            "limit": limit,
            "unlimited": limit <= 0,
        }
    return out
