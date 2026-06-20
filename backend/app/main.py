from contextlib import asynccontextmanager

from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
import structlog

from app.core.config import get_settings
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
from app.db.session import engine
from app.models.database import Base
from app.models.beta import Base as BetaBase

settings = get_settings()
logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("starting_up", app_name=settings.APP_NAME, version=settings.APP_VERSION)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(BetaBase.metadata.create_all)
    yield
    # Shutdown
    logger.info("shutting_down")
    await engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    description="Enterprise Document Processing Platform - API",
    version=settings.APP_VERSION,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    openapi_url="/openapi.json" if settings.DEBUG else None,
    lifespan=lifespan,
)

# Middleware
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


# Health check
@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "healthy", "version": settings.APP_VERSION}


# API routers
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


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error("unhandled_exception", error=str(exc), path=request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=settings.DEBUG)
