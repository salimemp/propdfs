import structlog
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = structlog.get_logger()


class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = str(request.headers.get("X-Request-ID", "unknown"))
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)

        logger.info(
            "request_started",
            method=request.method,
            path=request.url.path,
            client=request.client.host if request.client else None,
        )

        response = await call_next(request)

        logger.info(
            "request_completed",
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
        )
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple rate limiting middleware using Redis."""
    
    async def dispatch(self, request: Request, call_next):
        # Implement Redis-based rate limiting here
        return await call_next(request)
