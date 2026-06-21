"""Redis-based rate limiting middleware.

Implements a fixed-window counter per (client IP, route prefix). On each
request we increment a Redis key like `rl:<bucket>:<minute_epoch>` with
TTL = window size + a small grace period. If the counter exceeds the
limit, we return 429 Too Many Requests with a `Retry-After` header.

For routes that don't have an explicit limit, we fall through. Auth
endpoints are the natural target (prevent credential stuffing / brute
force); document upload gets a higher limit since it's heavier but
legitimate.

Wire-up is in `app/main.py` — see `add_middleware(RateLimitMiddleware, ...)`.
"""
import time
from typing import Awaitable, Callable

import structlog
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

logger = structlog.get_logger()

# (path prefix, requests-per-window, window-seconds)
ROUTE_LIMITS: list[tuple[str, int, int]] = [
    ("/api/v1/auth/login", 10, 60),
    ("/api/v1/auth/register", 5, 60),
    ("/api/v1/auth/refresh", 30, 60),
    ("/api/v1/auth/google/login", 20, 60),
    ("/api/v1/auth/github/login", 20, 60),
    ("/api/v1/beta/feedback", 30, 60),
    ("/api/v1/ai/", 60, 60),
    ("/api/v1/process/", 30, 60),
    ("/api/v1/documents/upload", 30, 60),
    ("/api/v1/ocr/", 20, 60),
]


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple Redis fixed-window rate limiter."""

    def __init__(self, app: ASGIApp, redis_client) -> None:
        super().__init__(app)
        # Accept either a `redis.asyncio.Redis` instance or `None`. If None,
        # the middleware becomes a no-op (useful for tests / when Redis
        # isn't yet configured).
        self._redis = redis_client

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable],
    ):
        if self._redis is None:
            return await call_next(request)

        path = request.url.path
        limit = self._limit_for(path)
        if limit is None:
            return await call_next(request)

        max_requests, window_seconds = limit
        client_ip = self._client_ip(request)
        now = int(time.time())
        bucket = now // window_seconds
        key = f"rl:{path}:{client_ip}:{bucket}"

        try:
            # Atomic increment; set TTL on first request.
            count = await self._redis.incr(key)
            if count == 1:
                await self._redis.expire(key, window_seconds + 5)

            if count > max_requests:
                retry_after = window_seconds - (now % window_seconds)
                logger.warning(
                    "rate_limit_exceeded",
                    path=path,
                    client_ip=client_ip,
                    count=count,
                    limit=max_requests,
                )
                return JSONResponse(
                    status_code=429,
                    content={
                        "detail": "Too many requests. Please slow down.",
                    },
                    headers={"Retry-After": str(retry_after)},
                )
        except Exception as e:  # noqa: BLE001
            # Redis down — fail open so the API stays available. Log loudly.
            logger.error("rate_limit_redis_error", error=str(e), path=path)

        return await call_next(request)

    @staticmethod
    def _limit_for(path: str) -> tuple[int, int] | None:
        """Return (max_requests, window_seconds) for a path, or None if no limit applies."""
        for prefix, max_requests, window_seconds in ROUTE_LIMITS:
            if path.startswith(prefix):
                return (max_requests, window_seconds)
        return None

    @staticmethod
    def _client_ip(request: Request) -> str:
        # Prefer the first hop of X-Forwarded-For if behind a proxy, else
        # fall back to the direct client. Only trust X-Forwarded-For when
        # running behind a known reverse proxy in production.
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        if request.client is not None:
            return request.client.host
        return "unknown"
