from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

import structlog
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.core.config import get_settings
from app.models.database import User, UserSession, UserStatus

logger = structlog.get_logger()
settings = get_settings()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    # Set `type` AFTER copying the caller's dict so that callers can
    # issue special-purpose tokens (mfa_pending, password_reset,
    # email_verification, ...) without us hard-coding "access". The
    # caller-provided value (if any) wins; we only default to "access"
    # when the caller didn't specify.
    if "type" not in to_encode:
        to_encode["type"] = "access"
    to_encode["exp"] = expire
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    # Same pattern as create_access_token: don't clobber a caller-
    # supplied `type`. Refresh tokens keep type="refresh" because
    # the only callsite (auth.py:register/login/refresh) passes
    # {"type": "refresh"} implicitly via this function.
    if "type" not in to_encode:
        to_encode["type"] = "refresh"
    to_encode["exp"] = expire
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        return payload
    except JWTError:
        return None


async def authenticate_user(
    db: AsyncSession, email: str, password: str
) -> Optional[User]:
    result = await db.execute(select(User).where(User.email == email.lower()))
    user = result.scalar_one_or_none()
    if not user or not user.password_hash:
        return None
    if not verify_password(password, user.password_hash):
        return None
    if user.status != UserStatus.ACTIVE:
        return None
    return user


async def create_user_session(
    db: AsyncSession,
    user_id: UUID,
    token_jti: str,
    device_info: Optional[str] = None,
    ip_address: Optional[str] = None,
) -> UserSession:
    expires_at = datetime.now(timezone.utc) + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    session = UserSession(
        user_id=user_id,
        token_jti=token_jti,
        device_info=device_info,
        ip_address=ip_address,
        expires_at=expires_at,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


async def revoke_user_session(db: AsyncSession, token_jti: str) -> None:
    await db.execute(
        update(UserSession)
        .where(UserSession.token_jti == token_jti)
        .values(revoked_at=datetime.now(timezone.utc))
    )
    await db.commit()


async def is_session_valid(db: AsyncSession, token_jti: str) -> bool:
    result = await db.execute(
        select(UserSession).where(
            UserSession.token_jti == token_jti,
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > datetime.now(timezone.utc),
        )
    )
    return result.scalar_one_or_none() is not None
