from datetime import datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field, ConfigDict

from app.models.database import PlanTier, DocumentStatus


# ─── Auth Schemas ───
class UserRegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: Optional[str] = Field(None, max_length=255)


class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str


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
