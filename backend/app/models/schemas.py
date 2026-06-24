from datetime import datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field, field_validator, ConfigDict

from app.core.password_policy import (
    check_password_rules,
    RULE_MIN_LENGTH,
    RULE_UPPERCASE,
    RULE_DIGIT,
    RULE_SPECIAL,
)
from app.models.database import PlanTier, DocumentStatus


# ─── Auth Schemas ───
class UserRegisterRequest(BaseModel):
    email: EmailStr
    # Hard limit is the same as before (8..128 chars); the
    # deeper policy (digit / uppercase / special) is enforced
    # in the field_validator below so we can return a single
    # helpful 422 with a per-rule breakdown rather than a
    # cryptic Pydantic error.
    password: str = Field(min_length=8, max_length=128)
    full_name: Optional[str] = Field(None, max_length=255)
    # Cloudflare Turnstile token. Required when Turnstile is
    # enabled (production). The endpoint verifies it server-side
    # before creating the account.
    turnstile_token: Optional[str] = Field(None, max_length=4096)

    @field_validator("password")
    @classmethod
    def _validate_password_policy(cls, value: str) -> str:
        result = check_password_rules(value)
        # The structural-rule failures — these are what we block
        # signup on. The breach check happens at the route level
        # so we can also return a useful "Found in N breaches" 422
        # with the count.
        structural = {RULE_MIN_LENGTH, RULE_UPPERCASE, RULE_DIGIT, RULE_SPECIAL}
        missing = structural - set(result.passed)
        if missing:
            # Match the rule IDs to human-friendly messages so the
            # Flutter form can render the right copy next to the
            # failing rule. The client already validates locally;
            # this is a server-side backstop.
            labels = {
                RULE_MIN_LENGTH: "at least 8 characters",
                RULE_UPPERCASE: "at least 1 uppercase letter",
                RULE_DIGIT: "at least 1 number",
                RULE_SPECIAL: "at least 1 special character",
            }
            raise ValueError(
                "Password does not meet the policy: "
                + ", ".join(labels[m] for m in missing)
            )
        return value


class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str
    # Cloudflare Turnstile token (required when Turnstile is
    # enabled). Verified server-side before we touch the
    # credentials. Putting it on login too means a leaked
    # password + a Turnstile bypass is still not enough to
    # log in.
    turnstile_token: Optional[str] = Field(None, max_length=4096)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    # When the user has 2FA enabled, /login returns only `mfa_token` and
    # these two flags. The client POSTs the TOTP code to
    # /auth/2fa/verify to receive the normal token pair.
    mfa_required: bool = False
    mfa_token: Optional[str] = None


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    email: str
    full_name: Optional[str]
    plan_tier: PlanTier
    is_email_verified: bool
    is_mfa_enabled: bool
    created_at: datetime
    avatar_url: Optional[str] = None


class RefreshTokenRequest(BaseModel):
    refresh_token: str
    # Token rotation is on by default — every refresh mints a new
    # JTI and revokes the old one. That's the right behaviour for
    # browser sessions (replay protection) but it's a footgun for
    # long-lived service tokens (CI workflows, scripts) that store
    # the refresh token and reuse it across runs. Set rotate=False
    # for those use cases — the JTI stays stable, the original
    # 7-day TTL applies, and the GitHub secret doesn't need to be
    # re-minted after every workflow run.
    rotate: bool = True


# ─── MFA / 2FA Schemas ───


class MFASetupResponse(BaseModel):
    """Returned from /auth/2fa/setup so the user can enrol an authenticator app."""

    secret: str  # base32-encoded TOTP secret
    otpauth_url: str  # otpauth://totp/... URI the QR code encodes
    qr_png_data_url: str  # data:image/png;base64,... ready to drop into <img src>


class MFAEnableRequest(BaseModel):
    """Sent to /auth/2fa/enable to confirm the user has scanned the QR
    and successfully typed a code from their authenticator app."""

    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class MFADisableRequest(BaseModel):
    """Sent to /auth/2fa/disable to turn 2FA off (requires password re-confirm)."""

    password: str


class MFAVerifyRequest(BaseModel):
    """Sent after a successful login when the user has 2FA enabled.
    Completes the login by returning a normal token pair on success."""

    mfa_token: str  # short-lived token returned from /login when MFA is required
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class MFALoginResponse(BaseModel):
    """Returned from /login when the user has 2FA enabled — the client
    must then POST to /auth/2fa/verify with [code]."""

    mfa_required: bool = True
    mfa_token: str


# ─── Document Schemas ───
class DocumentUploadResponse(BaseModel):
    id: UUID
    filename: str
    original_name: str
    status: DocumentStatus
    upload_url: str
    created_at: datetime


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    filename: str
    original_name: str
    mime_type: str
    file_size: int
    status: DocumentStatus
    page_count: Optional[int]
    extra_data: Optional[dict]
    created_at: datetime
    updated_at: datetime


class DocumentListResponse(BaseModel):
    items: List[DocumentResponse]
    total: int
    page: int
    page_size: int


# ─── Processing Task Schemas ───
class ProcessingRequest(BaseModel):
    task_type: str = Field(
        ..., pattern="^(merge|split|compress|convert|rotate|extract|watermark|ocr)$"
    )
    input_document_ids: List[UUID]
    output_format: Optional[str] = None
    params: Optional[dict] = Field(None, description="Task-specific parameters")


class ProcessingResponse(BaseModel):
    id: UUID
    task_type: str
    status: str
    celery_task_id: Optional[str]
    result_url: Optional[str]
    created_at: datetime
    completed_at: Optional[datetime]


# ─── Plan / Subscription Schemas ───
class PlanLimitResponse(BaseModel):
    plan_tier: PlanTier
    max_file_size_mb: int
    max_pages_per_file: Optional[int]
    max_conversions_per_day: int
    max_storage_mb: int
    supports_ocr: bool
    supports_ai: bool
    supports_api: bool


class SubscriptionCheckoutRequest(BaseModel):
    plan_tier: PlanTier
    success_url: str
    cancel_url: str


class SubscriptionCheckoutResponse(BaseModel):
    checkout_url: str
    session_id: str
