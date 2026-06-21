import uuid
from datetime import datetime, timezone

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
    Request,
)
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

import structlog
from app.core.config import get_settings
from app.core.security import (
    authenticate_user,
    create_access_token,
    create_refresh_token,
    decode_token,
    create_user_session,
    revoke_user_session,
    is_session_valid,
    hash_password,
)
from app.db.session import get_db
from app.models.database import User, UserStatus, PlanTier
from app.models.schemas import (
    UserRegisterRequest,
    UserLoginRequest,
    TokenResponse,
    UserResponse,
    RefreshTokenRequest,
)

logger = structlog.get_logger()
router = APIRouter(prefix="/auth", tags=["Authentication"])
settings = get_settings()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid authentication credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise credentials_exception
    user_id = payload.get("sub")
    if not user_id:
        raise credentials_exception

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user or user.status != UserStatus.ACTIVE:
        raise credentials_exception
    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.status != UserStatus.ACTIVE:
        raise HTTPException(status_code=403, detail="User account is not active")
    return current_user


@router.post(
    "/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED
)
async def register(
    request: Request, data: UserRegisterRequest, db: AsyncSession = Depends(get_db)
):
    # Check if user exists
    result = await db.execute(select(User).where(User.email == data.email.lower()))
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=data.email.lower(),
        password_hash=hash_password(data.password),
        full_name=data.full_name,
        status=UserStatus.ACTIVE,
        plan_tier=PlanTier.FREE,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    jti = str(uuid.uuid4())
    access_token = create_access_token(
        {"sub": str(user.id), "jti": jti, "email": user.email}
    )
    refresh_token = create_refresh_token({"sub": str(user.id), "jti": jti})
    await create_user_session(
        db,
        user.id,
        jti,
        device_info=str(request.headers.get("user-agent")),
        ip_address=request.client.host if request.client else None,
    )

    logger.info("user_registered", user_id=str(user.id), email=user.email)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    request: Request, data: UserLoginRequest, db: AsyncSession = Depends(get_db)
):
    user = await authenticate_user(db, data.email, data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    await db.execute(
        update(User)
        .where(User.id == user.id)
        .values(last_login_at=datetime.now(timezone.utc))
    )
    await db.commit()

    jti = str(uuid.uuid4())
    access_token = create_access_token(
        {"sub": str(user.id), "jti": jti, "email": user.email}
    )
    refresh_token = create_refresh_token({"sub": str(user.id), "jti": jti})
    await create_user_session(
        db,
        user.id,
        jti,
        device_info=str(request.headers.get("user-agent")),
        ip_address=request.client.host if request.client else None,
    )

    logger.info("user_login", user_id=str(user.id), email=user.email)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(data: RefreshTokenRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(data.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    jti = payload.get("jti")
    if not jti or not await is_session_valid(db, jti):
        raise HTTPException(status_code=401, detail="Session revoked or expired")

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user or user.status != UserStatus.ACTIVE:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    new_jti = str(uuid.uuid4())
    access_token = create_access_token(
        {"sub": str(user.id), "jti": new_jti, "email": user.email}
    )
    refresh_token = create_refresh_token({"sub": str(user.id), "jti": new_jti})
    await revoke_user_session(db, jti)
    await create_user_session(db, user.id, new_jti)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/logout")
async def logout(
    token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)
):
    payload = decode_token(token)
    if payload and payload.get("jti"):
        await revoke_user_session(db, payload["jti"])
    return {"message": "Successfully logged out"}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_active_user)):
    return current_user
