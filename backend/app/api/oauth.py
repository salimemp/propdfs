from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from authlib.integrations.starlette_client import OAuth
from starlette.config import Config
import uuid
import structlog

from app.db.session import get_db
from app.models.database import User, UserStatus, PlanTier
from app.models.schemas import TokenResponse
from app.core.security import create_access_token, create_refresh_token, create_user_session
from app.core.config import get_settings

logger = structlog.get_logger()
router = APIRouter(prefix="/auth", tags=["OAuth"])
settings = get_settings()

# Configure OAuth clients
oauth = OAuth()

if settings.GOOGLE_CLIENT_ID:
    oauth.register(
        name='google',
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
        client_kwargs={'scope': 'openid email profile'},
    )

if settings.GITHUB_CLIENT_ID:
    oauth.register(
        name='github',
        client_id=settings.GITHUB_CLIENT_ID,
        client_secret=settings.GITHUB_CLIENT_SECRET,
        access_token_url='https://github.com/login/oauth/access_token',
        access_token_params=None,
        authorize_url='https://github.com/login/oauth/authorize',
        authorize_params=None,
        api_base_url='https://api.github.com/',
        client_kwargs={'scope': 'user:email'},
    )


async def _get_or_create_oauth_user(
    db: AsyncSession, email: str, provider: str, oauth_id: str,
    full_name: str = None, avatar_url: str = None
) -> User:
    result = await db.execute(select(User).where(User.email == email.lower()))
    user = result.scalar_one_or_none()
    
    if user:
        # Update OAuth info if not set
        if not user.oauth_provider:
            user.oauth_provider = provider
            user.oauth_id = oauth_id
            await db.commit()
        return user
    
    # Create new user
    user = User(
        email=email.lower(),
        full_name=full_name,
        status=UserStatus.ACTIVE,
        plan_tier=PlanTier.FREE,
        oauth_provider=provider,
        oauth_id=oauth_id,
        avatar_url=avatar_url,
        is_email_verified=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    logger.info("oauth_user_created", provider=provider, email=email, user_id=str(user.id))
    return user


@router.get("/google/login")
async def google_login(request: Request):
    redirect_uri = request.url_for('google_callback')
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/google/callback")
async def google_callback(request: Request, db: AsyncSession = Depends(get_db)):
    try:
        token = await oauth.google.authorize_access_token(request)
        userinfo = token.get('userinfo')
        if not userinfo:
            raise HTTPException(status_code=400, detail="Failed to get user info from Google")
        
        email = userinfo.get('email')
        if not email:
            raise HTTPException(status_code=400, detail="Email not provided by Google")
        
        user = await _get_or_create_oauth_user(
            db, email, 'google', userinfo.get('sub'),
            full_name=userinfo.get('name'),
            avatar_url=userinfo.get('picture'),
        )
        
        jti = str(uuid.uuid4())
        access_token = create_access_token({"sub": str(user.id), "jti": jti, "email": user.email})
        refresh_token = create_refresh_token({"sub": str(user.id), "jti": jti})
        await create_user_session(db, user.id, jti)
        
        # Redirect to frontend with tokens
        redirect_url = f"{settings.FRONTEND_URL}/auth/callback?access_token={access_token}&refresh_token={refresh_token}"
        return RedirectResponse(url=redirect_url)
        
    except Exception as e:
        logger.error("google_oauth_error", error=str(e))
        raise HTTPException(status_code=400, detail=f"OAuth failed: {str(e)}")


@router.get("/github/login")
async def github_login(request: Request):
    redirect_uri = request.url_for('github_callback')
    return await oauth.github.authorize_redirect(request, redirect_uri)


@router.get("/github/callback")
async def github_callback(request: Request, db: AsyncSession = Depends(get_db)):
    try:
        token = await oauth.github.authorize_access_token(request)
        resp = await oauth.github.get('user', token=token)
        profile = resp.json()
        
        email = profile.get('email')
        if not email:
            # Fetch emails from GitHub
            emails_resp = await oauth.github.get('user/emails', token=token)
            emails = emails_resp.json()
            primary = next((e for e in emails if e.get('primary')), emails[0] if emails else None)
            email = primary.get('email') if primary else None
        
        if not email:
            raise HTTPException(status_code=400, detail="Email not provided by GitHub")
        
        user = await _get_or_create_oauth_user(
            db, email, 'github', str(profile.get('id')),
            full_name=profile.get('name') or profile.get('login'),
            avatar_url=profile.get('avatar_url'),
        )
        
        jti = str(uuid.uuid4())
        access_token = create_access_token({"sub": str(user.id), "jti": jti, "email": user.email})
        refresh_token = create_refresh_token({"sub": str(user.id), "jti": jti})
        await create_user_session(db, user.id, jti)
        
        redirect_url = f"{settings.FRONTEND_URL}/auth/callback?access_token={access_token}&refresh_token={refresh_token}"
        return RedirectResponse(url=redirect_url)
        
    except Exception as e:
        logger.error("github_oauth_error", error=str(e))
        raise HTTPException(status_code=400, detail=f"OAuth failed: {str(e)}")
