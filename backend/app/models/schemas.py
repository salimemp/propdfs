from datetime import datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field, ConfigDict

from app.models.database import PlanTier, UserStatus, DocumentStatus


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
    task_type: str = Field(..., pattern="^(merge|split|compress|convert|rotate|extract|watermark|ocr)$")
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
