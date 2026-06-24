"""Cloudflare Turnstile verification.

Flow:
  1. Frontend renders the Turnstile widget, which runs an
     invisible / managed challenge and yields a token.
  2. Frontend POSTs the token to /register or /login along
     with the rest of the form.
  3. This module POSTs `secret=<TURNSTILE_SECRET_KEY>` +
     `response=<token>` + (optionally) `remoteip=<client_ip>`
     to Cloudflare's siteverify endpoint and reads the result.

We cache the "verified" verdict in Redis with a short TTL so
the same token can't be re-used to authorise multiple requests
within its natural lifetime (Turnstile tokens are single-use;
the cache is belt-and-suspenders against a buggy client).

Dev mode: when TURNSTILE_ENABLED is False or the secret is
empty, [verify_token] returns True without making the network
call. This lets local dev keep working without having to
provision a Cloudflare site key.
"""

from __future__ import annotations

import hashlib
import logging
from typing import Optional

import httpx
import redis.asyncio as aioredis

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# Redis key prefix for verified Turnstile tokens. The token's
# own SHA-256 hash is the suffix — so the key doesn't leak the
# raw token in logs / `KEYS *` dumps.
_VERIFIED_KEY_PREFIX = "turnstile:verified:"


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _verified_key(token: str) -> str:
    return f"{_VERIFIED_KEY_PREFIX}{_token_hash(token)}"


async def verify_token(
    token: Optional[str],
    *,
    remote_ip: Optional[str] = None,
    redis_client: Optional[aioredis.Redis] = None,
) -> bool:
    """Verify a Turnstile token.

    Returns True if the token is valid (or if Turnstile is
    disabled). False if the token is missing / malformed /
    rejected by Cloudflare.

    Idempotent: a successful verification is cached in Redis
    for [Settings.TURNSTILE_TOKEN_TTL_SECONDS] so re-using the
    same token (e.g. if the client retries a request) doesn't
    hit Cloudflare twice.
    """
    settings = get_settings()

    # Short-circuit for dev / when Cloudflare isn't configured.
    if not settings.TURNSTILE_ENABLED or not settings.TURNSTILE_SECRET_KEY:
        logger.debug("turnstile_skipped_disabled")
        return True

    if not token:
        logger.warning("turnstile_token_missing")
        return False

    # Cache hit?
    if redis_client is not None:
        try:
            cached = await redis_client.get(_verified_key(token))
            if cached == b"1":
                logger.debug("turnstile_cache_hit")
                return True
        except Exception as e:
            # Redis hiccup — don't fail the request, just fall
            # through to the upstream siteverify call.
            logger.warning("turnstile_cache_lookup_failed", error=str(e))

    # Call Cloudflare's siteverify.
    payload = {
        "secret": settings.TURNSTILE_SECRET_KEY,
        "response": token,
    }
    if remote_ip:
        payload["remoteip"] = remote_ip

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                settings.TURNSTILE_VERIFY_URL,
                data=payload,
            )
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, httpx.TimeoutException) as e:
        # Cloudflare outage → fail closed (reject the request).
        # We could fail open with a warning, but the failure mode
        # we care about is "spammers should be blocked even if
        # our verification channel is down", not "every legit
        # user gets rejected on a hiccup". A 503 from this path
        # is the safer signal.
        logger.error("turnstile_siteverify_failed", error=str(e))
        return False

    if not data.get("success"):
        logger.warning(
            "turnstile_token_rejected",
            error_codes=data.get("error-codes", []),
        )
        return False

    # Cache the verified verdict.
    if redis_client is not None:
        try:
            await redis_client.set(
                _verified_key(token),
                "1",
                ex=settings.TURNSTILE_TOKEN_TTL_SECONDS,
            )
        except Exception as e:
            logger.warning("turnstile_cache_write_failed", error=str(e))

    return True


async def require_token(
    token: Optional[str],
    *,
    remote_ip: Optional[str] = None,
    redis_client: Optional[aioredis.Redis] = None,
) -> None:
    """Raise HTTPException(400) if the token is invalid.

    Drop-in replacement for the body of an auth endpoint:
        await require_token(body.turnstile_token, remote_ip=...)
    """
    from fastapi import HTTPException

    if not await verify_token(token, remote_ip=remote_ip, redis_client=redis_client):
        raise HTTPException(
            status_code=400,
            detail="Bot verification failed. Please refresh the page " "and try again.",
        )
