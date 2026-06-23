import base64
import io
import secrets
import uuid
from datetime import datetime, timezone, timedelta

import pyotp
import qrcode
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
    verify_password,
)
from app.db.session import get_db
from app.models.database import User, UserStatus, PlanTier
from app.models.schemas import (
    UserRegisterRequest,
    UserLoginRequest,
    TokenResponse,
    UserResponse,
    RefreshTokenRequest,
    MFASetupResponse,
    MFAEnableRequest,
    MFADisableRequest,
    MFAVerifyRequest,
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


async def require_admin(
    current_user: User = Depends(get_current_active_user),
) -> User:
    """Gate for admin-only endpoints (blog publishing, user management,
    etc.). Returns the admin user on success; raises 403 otherwise.

    Note: we keep this dependency here in auth.py even though it's
    consumed by other routers, so all the auth-shape helpers live in
    one place. Other routers `from app.api.auth import require_admin`.
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=403,
            detail="Admin privileges required for this action.",
        )
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

    # If MFA is enabled, issue a short-lived mfa_token instead of the
    # normal token pair. The client must POST to /auth/2fa/verify with
    # a TOTP code to complete the login.
    if user.is_mfa_enabled and user.mfa_secret:
        mfa_jti = str(uuid.uuid4())
        mfa_token = create_access_token(
            {
                "sub": str(user.id),
                "jti": mfa_jti,
                "email": user.email,
                "type": "mfa_pending",
            },
            # 5 minutes is plenty — TOTP codes are 30s windows so the
            # user has 10 windows to enter the code before it expires.
            expires_delta=timedelta(minutes=5),
        )
        logger.info(
            "user_login_mfa_required",
            user_id=str(user.id),
            email=user.email,
        )
        # Return the MFA-pending variant of TokenResponse. The client
        # sees `mfa_required == true` and posts the TOTP code to
        # /auth/2fa/verify.
        return TokenResponse(
            access_token="",  # not issued yet
            refresh_token="",
            mfa_required=True,
            mfa_token=mfa_token,
            expires_in=300,
        )

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

    # Token rotation: by default we rotate the JTI on every refresh
    # (revoke old session, mint new one) — this is the right default
    # for browser sessions because a stolen refresh token can only be
    # used once. For service tokens (CI workflows, scripts that
    # store the refresh token in a secret store and reuse it across
    # runs) the caller sets rotate=False so the JTI stays stable
    # and the GitHub secret doesn't need to be re-minted after every
    # workflow run.
    if data.rotate:
        new_jti = str(uuid.uuid4())
        await revoke_user_session(db, jti)
        await create_user_session(db, user.id, new_jti)
        jti = new_jti

    access_token = create_access_token(
        {"sub": str(user.id), "jti": jti, "email": user.email}
    )
    refresh_token = create_refresh_token({"sub": str(user.id), "jti": jti})

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


# ─── MFA / 2FA ───
#
# Implements TOTP per RFC 6238 using pyotp. The flow is:
#
#   1. Authenticated user POSTs /auth/2fa/setup
#      → backend generates a 160-bit base32 secret, persists it on the
#        User row (is_mfa_enabled stays false until they confirm), and
#        returns {secret, otpauth_url, qr_png_data_url}.
#   2. User scans the QR code with Google Authenticator / 1Password /
#      Authy / Bitwarden. Their app now shows a 6-digit code every 30s.
#   3. User POSTs /auth/2fa/enable {code: "123456"}
#      → backend verifies the code against the secret, flips
#        is_mfa_enabled to true, returns the fresh backup codes.
#   4. From then on /login returns `mfa_required=true` + `mfa_token`
#      instead of a normal token pair. Client posts the TOTP code to
#      /auth/2fa/verify to complete the sign-in.
#   5. POST /auth/2fa/disable {password} → turn it back off. Requires
#      the user's password as a deliberate-friction guard against
#      account takeover via a hijacked session.


def _qr_png_data_url(otpauth_url: str) -> str:
    """Render an otpauth:// URI as a QR PNG and return a base64 data URL
    ready to drop into an <img src=...> attribute."""
    qr = qrcode.QRCode(box_size=6, border=2)
    qr.add_data(otpauth_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return f"data:image/png;base64,{base64.b64encode(buf.getvalue()).decode('ascii')}"


def _generate_backup_codes(n: int = 10) -> list[str]:
    """Generate `n` one-time-use backup codes. Each is 10 chars from a
    32-char alphabet, formatted as 5+5 (e.g. ABCDE-FGHJK). The user
    saves these once at enrolment; we store hashes in mfa_backup_codes
    (one JSON column)."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # skip 0/O/1/I for readability
    return [
        "-".join(
            [
                "".join(secrets.choice(alphabet) for _ in range(5)),
                "".join(secrets.choice(alphabet) for _ in range(5)),
            ]
        )
        for _ in range(n)
    ]


@router.post("/2fa/setup", response_model=MFASetupResponse)
async def setup_mfa(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a fresh TOTP secret for the user. They have to scan the
    QR code and POST /auth/2fa/enable with a valid code to actually
    turn 2FA on — this endpoint just prepares the secret."""
    if current_user.is_mfa_enabled:
        raise HTTPException(
            status_code=400,
            detail="2FA is already enabled. Disable it first to re-enrol.",
        )

    # 160-bit secret — RFC 4226 recommended length.
    secret = pyotp.random_base32(length=32)

    # Build the otpauth:// URI per the Key URI Format spec.
    otpauth_url = pyotp.TOTP(secret).provisioning_uri(
        name=current_user.email,
        issuer_name="ProPDFs",
    )

    # Persist the secret (NOT yet enabled). The user must confirm with a
    # valid code at /auth/2fa/enable before is_mfa_enabled flips on.
    await db.execute(
        update(User)
        .where(User.id == current_user.id)
        .values(mfa_secret=secret, is_mfa_enabled=False)
    )
    await db.commit()

    return MFASetupResponse(
        secret=secret,
        otpauth_url=otpauth_url,
        qr_png_data_url=_qr_png_data_url(otpauth_url),
    )


@router.post("/2fa/enable")
async def enable_mfa(
    payload: MFAEnableRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Confirm the user has successfully scanned the QR code by
    verifying a TOTP code. On success, flips is_mfa_enabled to true and
    returns a fresh set of backup codes."""
    if not current_user.mfa_secret:
        raise HTTPException(
            status_code=400,
            detail="Start at /auth/2fa/setup first.",
        )
    if current_user.is_mfa_enabled:
        raise HTTPException(status_code=400, detail="2FA is already enabled.")

    totp = pyotp.TOTP(current_user.mfa_secret)
    # valid_window=1 accepts the code from 30s before/after to tolerate
    # clock drift between the server and the user's device.
    if not totp.verify(payload.code, valid_window=1):
        raise HTTPException(
            status_code=400,
            detail="That code doesn't match. Try the next one — codes "
            "rotate every 30 seconds.",
        )

    backup_codes = _generate_backup_codes()
    # Hash the backup codes before storing so a DB leak doesn't expose
    # them. (Same hashing scheme as passwords — bcrypt handles the salt.)
    hashed = [hash_password(c) for c in backup_codes]

    await db.execute(
        update(User)
        .where(User.id == current_user.id)
        .values(
            is_mfa_enabled=True,
            # mfa_backup_codes is a JSON/Text column; serialise the list.
            mfa_backup_codes=hashed,
        )
    )
    await db.commit()

    logger.info("mfa_enabled", user_id=str(current_user.id))

    return {
        "enabled": True,
        "backup_codes": backup_codes,
        "message": "Save these backup codes somewhere safe — they each "
        "work once if you lose your authenticator.",
    }


@router.post("/2fa/verify", response_model=TokenResponse)
async def verify_mfa(
    payload: MFAVerifyRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Complete a 2FA-protected login. The client posts the mfa_token
    from /login and the 6-digit code; on success we issue the normal
    token pair and start a session."""
    mfa_payload = decode_token(payload.mfa_token)
    if not mfa_payload or mfa_payload.get("type") != "mfa_pending":
        raise HTTPException(
            status_code=401,
            detail="MFA session expired or invalid. Sign in again.",
        )

    user_id = mfa_payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid MFA token.")

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user or user.status != UserStatus.ACTIVE or not user.mfa_secret:
        raise HTTPException(status_code=401, detail="User not found.")

    totp = pyotp.TOTP(user.mfa_secret)
    if not totp.verify(payload.code, valid_window=1):
        raise HTTPException(status_code=401, detail="Invalid code.")

    # Mark last_login and issue the normal token pair.
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

    logger.info("mfa_verified_login", user_id=str(user.id))

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/2fa/disable")
async def disable_mfa(
    payload: MFADisableRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Turn 2FA off. Requires the user's password as a deliberate-friction
    guard against account takeover via a hijacked session."""
    if not current_user.is_mfa_enabled:
        raise HTTPException(status_code=400, detail="2FA is not enabled.")
    if not current_user.password_hash or not verify_password(
        payload.password, current_user.password_hash
    ):
        raise HTTPException(status_code=401, detail="Wrong password.")

    await db.execute(
        update(User)
        .where(User.id == current_user.id)
        .values(
            is_mfa_enabled=False,
            mfa_secret=None,
            mfa_backup_codes=None,
        )
    )
    await db.commit()

    logger.info("mfa_disabled", user_id=str(current_user.id))
    return {"disabled": True}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_active_user)):
    return current_user
