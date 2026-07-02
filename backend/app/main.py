from contextlib import asynccontextmanager
import os

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from starlette.middleware.sessions import SessionMiddleware
import structlog

from app.core.config import get_settings
from app.core.rate_limit import RateLimitMiddleware
from app.api.auth import router as auth_router
from app.api.documents import router as documents_router
from app.api.process import router as process_router
from app.api.oauth import router as oauth_router
from app.api.beta import router as beta_router
from app.api.conversion import router as conversion_router
from app.api.ocr import router as ocr_router
from app.api.ai import router as ai_router
from app.api.legal import router as legal_router
from app.api.blog import router as blog_router
from app.api.waitlist import router as waitlist_router
from app.api.assets import router as assets_router
from app.db.session import engine, get_redis
from app.models.database import Base
from app.models.beta import Base as BetaBase

settings = get_settings()
logger = structlog.get_logger()

# --- Observability -----------------------------------------------------------

# Prometheus counters / histograms. Exposed at /metrics.
REQUEST_COUNT = Counter(
    "propdfs_http_requests_total",
    "Total HTTP requests handled",
    ["method", "path", "status"],
)
REQUEST_LATENCY = Histogram(
    "propdfs_http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["method", "path"],
)


# --- Lifespan ---------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info(
        "starting_up",
        app_name=settings.APP_NAME,
        version=settings.APP_VERSION,
        env=settings.ENVIRONMENT,
    )

    # Sentry — initialise only if DSN provided. Errors raised by Sentry
    # init are logged but don't crash startup.
    if settings.SENTRY_DSN:
        try:
            import sentry_sdk
            from sentry_sdk.integrations.fastapi import FastApiIntegration
            from sentry_sdk.integrations.starlette import StarletteIntegration

            sentry_sdk.init(
                dsn=settings.SENTRY_DSN,
                environment=settings.ENVIRONMENT,
                release=f"{settings.APP_NAME}@{settings.APP_VERSION}",
                traces_sample_rate=0.1 if settings.ENVIRONMENT == "production" else 0.0,
                integrations=[
                    StarletteIntegration(),
                    FastApiIntegration(),
                ],
            )
            logger.info("sentry_initialized")
        except Exception as e:  # noqa: BLE001
            logger.warning("sentry_init_failed", error=str(e))

    # Database
    async with engine.begin() as conn:
        # First, heal any schema drift from earlier deploys (adds
        # columns that the model has but the live DB is missing).
        # See app/db/migrations.py for the additive-only list.
        from app.db.migrations import run_additive_migrations

        await run_additive_migrations(conn)
        # Then create any missing tables. Safe to call after the
        # migration step — IF NOT EXISTS makes both no-ops on
        # subsequent deploys.
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(BetaBase.metadata.create_all)

    yield

    # Shutdown
    logger.info("shutting_down")
    await engine.dispose()
    redis = await get_redis()
    await redis.aclose()


app = FastAPI(
    title=settings.APP_NAME,
    description="Enterprise Document Processing Platform - API",
    version=settings.APP_VERSION,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    openapi_url="/openapi.json" if settings.DEBUG else None,
    lifespan=lifespan,
)


# --- Middleware -------------------------------------------------------------


# CORS — must be added before other middleware so preflight requests
# don't get blocked by the rate limiter.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
        "https://propdfs.com",
        "https://www.propdfs.com",
        "http://localhost:3000",
        "http://localhost:8080",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(GZipMiddleware, minimum_size=1000)


# SessionMiddleware — empty session, no secret needed for our use case.
# We don't store anything in request.session, but Starlette's
# OAuth library + FastAPI's request.url_for machinery reaches into
# it on older Starlette versions (FastAPI 0.111.0 pins ~0.36). Without
# this middleware mounted, the OAuth /login endpoints trip
# `AssertionError("SessionMiddleware must be installed to access
# request.session")` at runtime — see live debug in 4f17719.
#
# A secret_key IS required by Starlette even though we don't write
# anything; using settings.SECRET_KEY keeps the signing-key surface
# consistent with our JWT signing key. A random per-request cookie
# would still trip the assertion, so we keep it mounted.
app.add_middleware(
    SessionMiddleware, secret_key=settings.SECRET_KEY, max_age=14 * 24 * 60 * 60
)


@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    """Record request count + latency for Prometheus."""
    import time

    start = time.perf_counter()
    response: Response = await call_next(request)
    duration = time.perf_counter() - start

    # Normalize path so /docs/123 and /docs/456 don't explode the label set.
    normalized = _normalize_path(request.url.path)
    REQUEST_COUNT.labels(
        method=request.method,
        path=normalized,
        status=response.status_code,
    ).inc()
    REQUEST_LATENCY.labels(
        method=request.method,
        path=normalized,
    ).observe(duration)

    return response


def _normalize_path(path: str) -> str:
    """Collapse UUIDs and IDs in path to keep cardinality bounded."""
    import re

    parts = path.split("/")
    out = []
    uuid_re = re.compile(
        r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
        re.I,
    )
    for p in parts:
        if uuid_re.match(p):
            out.append("{id}")
        else:
            out.append(p)
    return "/".join(out) or "/"


# Rate limiter — must be added AFTER CORS but the order here is
# outer-first for FastAPI middleware. Since CORSMiddleware was added
# first (above), the RateLimitMiddleware below wraps it. That's fine
# because we already do preflight-friendly allow_origins above.


@app.middleware("http")
async def attach_rate_limit(request: Request, call_next):
    """Dynamically attach the Redis-backed rate limiter at request time.

    We use the dependency-injected Redis pool rather than creating a new
    one at import time, so failures during startup don't crash the
    process.
    """
    # If not already wrapped, install it once.
    if not getattr(app.state, "_rate_limit_attached", False):
        try:
            redis = await get_redis()
            app.add_middleware(RateLimitMiddleware, redis_client=redis)
            app.state._rate_limit_attached = True
            logger.info("rate_limit_attached")
        except Exception as e:  # noqa: BLE001
            logger.warning("rate_limit_disabled", error=str(e))
            app.state._rate_limit_attached = True  # don't try again

    return await call_next(request)


# --- Routes -----------------------------------------------------------------


# Health check (lightweight, no DB).
@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "version": settings.APP_VERSION,
        "git_sha": os.environ.get("RAILWAY_GIT_COMMIT_SHA", "unknown"),
        "oauth_handler_v2": "yes",
        # Pin which version of the global exception handler is
        # deployed. Lets us read this from `/health` and confirm
        # in one curl whether fix 10b38fc (let HTTPException
        # pass through) is live. Without this we can't tell
        # whether the OAuth 500s are due to a stale container
        # or a different code path.
        "exception_handler_v2": (
            "rereaise" if "raise exc" in _EX_HANDLER_BODY else "swallow"
        ),
        # Live introspection of the OAuth module — confirms
        # whether the OAuth router running on this replica has
        # the new X-ProPDFs-Oauth-Debug header in its source.
        # If this says "old" while /health says "yes" to the v2
        # markers, the image has a mixed bag of code and the
        # COPY step is partially broken.
        "oauth_module_v2": _OAUTH_V2_MARKER,
    }


# Body of the global exception handler, captured at import time
# so /health can report which version is deployed. Used by the
# exception_handler_v2 field above.
_EX_HANDLER_BODY: str = ""


# Live source-of-truth on whether the OAuth module the running
# container loaded includes the v2 diagnostic header. Captured at
# import time so the value is set before any request can hit
# /health.
_OAUTH_V2_MARKER: str = "unknown"
try:
    from inspect import getsource as _gs
    from app.api import oauth as _oauth_mod

    if "google_login_v2_not_configured" in _gs(_oauth_mod.google_login):
        _OAUTH_V2_MARKER = "v2"
    else:
        _OAUTH_V2_MARKER = "old"
except Exception:
    _OAUTH_V2_MARKER = "introspect-error"


# Re-pickup: capture after the handler is defined below. We do this
# at module import time so the value is set before any request
# can hit /health.
def _capture_ex_handler_body():
    global _EX_HANDLER_BODY
    try:
        from inspect import getsource

        from app.main import global_exception_handler  # noqa: F401

        src = getsource(global_exception_handler)
        _EX_HANDLER_BODY = src
    except Exception:
        _EX_HANDLER_BODY = ""


# Prometheus metrics endpoint. No auth — typically scraped over an
# internal network only.
@app.get("/metrics", tags=["Observability"], include_in_schema=False)
async def metrics():
    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST,
    )


app.include_router(auth_router, prefix="/api/v1")
app.include_router(oauth_router, prefix="/api/v1")
app.include_router(documents_router, prefix="/api/v1")
app.include_router(process_router, prefix="/api/v1")
app.include_router(conversion_router, prefix="/api/v1")
app.include_router(ocr_router, prefix="/api/v1")
app.include_router(ai_router, prefix="/api/v1")
app.include_router(beta_router, prefix="/api/v1")
app.include_router(legal_router, prefix="/api/v1")
app.include_router(blog_router, prefix="/api/v1")
app.include_router(waitlist_router, prefix="/api/v1")
# /assets/* is intentionally NOT under /api/v1 — it gets
# resolved by the frontend's _resolveImageUrl which prepends
# the bare API base URL. The frontend reads it as a relative
# path against the same origin, so the file lives at the
# root of the API host.
app.include_router(assets_router)


# Global exception handler — keep last so it wraps everything.
#
# We register against `Exception` so that any unhandled Python error
# still produces a clean JSON 500 (not a stack trace leak). We also
# handle HTTPException here so the JSON envelope (`{"detail": ...}`)
# matches FastAPI's default shape exactly.
#
# Background: the previous version tried to re-raise HTTPException
# so FastAPI's built-in handler would run. That created an
# infinite-loop on the live deployment — re-raising inside an
# exception handler routes back through the same lookup, finds
# the same Exception handler, and the framework falls back to a
# bare 500 with body `{"detail":"Internal server error"}`. The
# fix is to render HTTPException directly here, identical to
# what fastapi.exception_handlers.http_exception_handler does,
# rather than re-raise.
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    if isinstance(exc, HTTPException):
        # Render HTTPException ourselves — same shape as
        # FastAPI's built-in handler ({"detail": exc.detail},
        # exc.status_code, exc.headers).
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
            headers=getattr(exc, "headers", None),
        )

    logger.error(
        "unhandled_exception",
        error=str(exc),
        path=request.url.path,
        exc_type=type(exc).__name__,
    )
    # TEMP DEBUG: include the exception class + str() in the body
    # so a curl can show us what's actually throwing. Once the
    # OAuth 500s are diagnosed we'll revert this to the generic
    # body. The /health response tracks exception_handler_v2 so we
    # know when this is live.
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "Internal server error",
            "_debug_exc_type": type(exc).__name__,
            "_debug_exc_str": str(exc)[:500],
        },
    )


# Register the same handler for the explicit HTTPException type so
# FastAPI's built-in is overridden. The combination above already
# matches HTTPException via isinstance, but registering for the
# concrete class too prevents any subclass-match confusion if a
# route raises a custom subclass of HTTPException.
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):  # noqa: F811
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=getattr(exc, "headers", None),
    )


# Capture this handler's source code at import time so /health
# can report which version is deployed. Helps diagnose stale-
# container issues when the OAuth /login endpoint returns 500.
_capture_ex_handler_body()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=settings.DEBUG)
