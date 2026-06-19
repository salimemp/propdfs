import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from pydantic import BaseModel, EmailStr
import structlog

from app.db.session import get_db
from app.models.database import User, UserStatus, Document, ProcessingTask, UserSession, UsageLog
from app.models.beta import BetaUser, BetaWaitlist
from app.api.auth import get_current_active_user
from app.services.storage_service import storage_service

logger = structlog.get_logger()
router = APIRouter(prefix="/legal", tags=["Legal & Compliance"])

class DataDeletionRequest(BaseModel):
    reason: Optional[str] = None
    confirm_email: EmailStr
    confirm_text: str  # Must be "DELETE MY ACCOUNT"

class DataExportRequest(BaseModel):
    format: str = "json"  # json, csv, pdf

class DataDeletionResponse(BaseModel):
    message: str
    deletion_id: str
    status: str
    scheduled_deletion_date: datetime


@router.get("/privacy-policy")
async def get_privacy_policy():
    """Return the privacy policy content."""
    return {
        "title": "ProPDFs Privacy Policy",
        "effective_date": "2025-01-01",
        "last_updated": "2025-01-01",
        "version": "1.0",
        "sections": [
            "introduction",
            "information_we_collect",
            "how_we_use_information",
            "cookies",
            "data_sharing",
            "data_security",
            "your_rights",
            "childrens_privacy",
            "international_transfers",
            "hipaa_compliance",
            "changes",
            "contact"
        ],
        "compliance_frameworks": ["GDPR", "CCPA", "PIPEDA", "LGPD", "APPI", "SOC2"],
        "data_retention_days": {
            "account_info": "until_deletion",
            "documents": 1,  # 24 hours unless saved
            "saved_documents": "until_deletion",
            "usage_logs": 90,
            "payment_records": 2555,  # 7 years
        },
        "contact": {
            "email": "privacy@propdfs.com",
            "dpo_email": "dpo@propdfs.com",
            "address": "ProPDFs Privacy Team, 123 Innovation Drive, San Francisco, CA 94105, USA"
        }
    }


@router.get("/terms-of-service")
async def get_terms_of_service():
    """Return the terms of service content."""
    return {
        "title": "ProPDFs Terms of Service",
        "effective_date": "2025-01-01",
        "last_updated": "2025-01-01",
        "version": "1.0",
        "sections": [
            "acceptance",
            "eligibility",
            "description",
            "accounts",
            "acceptable_use",
            "subscriptions",
            "intellectual_property",
            "third_party",
            "disclaimers",
            "indemnification",
            "governing_law",
            "termination",
            "changes",
            "beta_terms",
            "api_terms",
            "contact"
        ],
        "minimum_age": 16,
        "governing_law": "State of California, USA",
        "contact": {
            "legal": "legal@propdfs.com",
            "dmca": "dmca@propdfs.com",
            "privacy": "privacy@propdfs.com"
        }
    }


@router.get("/cookie-policy")
async def get_cookie_policy():
    """Return the cookie policy content."""
    return {
        "title": "Cookie Policy",
        "categories": {
            "essential": {
                "description": "Required for basic functionality",
                "cookies": ["auth_token", "refresh_token", "csrf_token"],
                "required": True
            },
            "functional": {
                "description": "Remember your preferences",
                "cookies": ["language_preference", "theme_preference", "accessibility_settings", "cookie_consent"],
                "required": False
            },
            "analytics": {
                "description": "Help us understand usage (anonymized)",
                "cookies": ["_ga", "_gid", "_gat"],
                "required": False
            },
            "advertising": {
                "description": "Show relevant ads (opt-in only)",
                "cookies": ["_gads", "_gcl_au"],
                "required": False
            }
        },
        "third_party_cookies": [
            {"provider": "Google Analytics", "purpose": "Usage analytics", "link": "https://policies.google.com/privacy"},
            {"provider": "Stripe", "purpose": "Payment processing", "link": "https://stripe.com/privacy"},
            {"provider": "Cloudflare", "purpose": "CDN and security", "link": "https://www.cloudflare.com/privacypolicy/"}
        ]
    }


@router.post("/delete-account", response_model=DataDeletionResponse, status_code=status.HTTP_202_ACCEPTED)
async def delete_account(
    request: DataDeletionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Initiate GDPR/CCPA-compliant account deletion."""
    
    # Verify confirmation
    if request.confirm_text != "DELETE MY ACCOUNT":
        raise HTTPException(
            status_code=400,
            detail="Confirmation text must be exactly: DELETE MY ACCOUNT"
        )
    
    if request.confirm_email.lower() != current_user.email.lower():
        raise HTTPException(
            status_code=400,
            detail="Confirmation email does not match your account email"
        )
    
    deletion_id = str(uuid.uuid4())
    scheduled_date = datetime.now(timezone.utc) + timedelta(days=30)  # 30-day grace period
    
    logger.info(
        "account_deletion_requested",
        user_id=str(current_user.id),
        deletion_id=deletion_id,
        reason=request.reason
    )
    
    # Mark account for deletion (soft delete first)
    await db.execute(
        update(User).where(User.id == current_user.id).values(
            status=UserStatus.DELETED,
            deletion_requested_at=datetime.now(timezone.utc),
            deletion_scheduled_at=scheduled_date,
            deletion_id=deletion_id,
            deletion_reason=request.reason
        )
    )
    await db.commit()
    
    return DataDeletionResponse(
        message="Account deletion initiated. You have 30 days to cancel this request by contacting support.",
        deletion_id=deletion_id,
        status="pending",
        scheduled_deletion_date=scheduled_date
    )


@router.get("/my-data")
async def get_my_data_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get summary of all data we hold about you (GDPR Article 15)."""
    
    # Count documents
    doc_result = await db.execute(
        select(Document).where(Document.user_id == current_user.id)
    )
    documents = doc_result.scalars().all()
    
    # Count sessions
    session_result = await db.execute(
        select(UserSession).where(UserSession.user_id == current_user.id)
    )
    sessions = session_result.scalars().all()
    
    # Count usage logs
    usage_result = await db.execute(
        select(UsageLog).where(UsageLog.user_id == current_user.id)
    )
    usage_logs = usage_result.scalars().all()
    
    # Check beta status
    beta_result = await db.execute(
        select(BetaUser).where(BetaUser.user_id == current_user.id)
    )
    beta_user = beta_result.scalar_one_or_none()
    
    return {
        "user_id": str(current_user.id),
        "email": current_user.email,
        "full_name": current_user.full_name,
        "account_created": current_user.created_at,
        "last_login": current_user.last_login_at,
        "plan_tier": current_user.plan_tier.value,
        "data_summary": {
            "documents_stored": len(documents),
            "total_storage_bytes": sum(d.file_size for d in documents),
            "active_sessions": len([s for s in sessions if s.revoked_at is None]),
            "total_sessions": len(sessions),
            "usage_actions": len(usage_logs),
            "beta_enrolled": beta_user is not None,
        },
        "data_categories": [
            {"category": "Account Information", "description": "Email, name, profile data", "purpose": "Authentication and service provision"},
            {"category": "Documents", "description": "Uploaded and processed files", "purpose": "Processing your requests"},
            {"category": "Usage Data", "description": "Logs of actions taken", "purpose": "Service improvement and security"},
            {"category": "Payment Data", "description": "Billing information (via Stripe)", "purpose": "Subscription management"},
            {"category": "Device Data", "description": "IP, browser, device type", "purpose": "Security and fraud prevention"},
        ],
        "retention_periods": {
            "account_info": "Until account deletion + 30 days",
            "documents": "24 hours (unless saved to account)",
            "saved_documents": "Until deletion or account termination",
            "usage_logs": "90 days",
            "payment_records": "7 years (legal requirement)"
        },
        "download_options": {
            "json": "/api/v1/legal/export-data?format=json",
            "csv": "/api/v1/legal/export-data?format=csv",
            "pdf": "/api/v1/legal/export-data?format=pdf"
        }
    }


@router.get("/export-data")
async def export_personal_data(
    format: str = "json",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Export all personal data in machine-readable format (GDPR Article 20)."""
    
    # Get all user data
    doc_result = await db.execute(
        select(Document).where(Document.user_id == current_user.id)
    )
    documents = doc_result.scalars().all()
    
    usage_result = await db.execute(
        select(UsageLog).where(UsageLog.user_id == current_user.id)
    )
    usage_logs = usage_result.scalars().all()
    
    data = {
        "export_metadata": {
            "user_id": str(current_user.id),
            "export_date": datetime.now(timezone.utc).isoformat(),
            "format": format,
            "version": "1.0"
        },
        "account_data": {
            "email": current_user.email,
            "full_name": current_user.full_name,
            "plan_tier": current_user.plan_tier.value,
            "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
            "last_login": current_user.last_login_at.isoformat() if current_user.last_login_at else None,
        },
        "documents": [
            {
                "id": str(d.id),
                "filename": d.filename,
                "mime_type": d.mime_type,
                "file_size": d.file_size,
                "page_count": d.page_count,
                "status": d.status.value,
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in documents
        ],
        "usage_logs": [
            {
                "id": str(u.id),
                "action": u.action,
                "file_size": u.file_size,
                "page_count": u.page_count,
                "processing_time_ms": u.processing_time_ms,
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u in usage_logs
        ]
    }
    
    logger.info("data_exported", user_id=str(current_user.id), format=format)
    return data


@router.post("/cancel-deletion/{deletion_id}")
async def cancel_deletion(
    deletion_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Cancel a pending account deletion request."""
    
    if current_user.deletion_id != deletion_id:
        raise HTTPException(status_code=404, detail="Deletion request not found")
    
    if current_user.status != UserStatus.DELETED or not current_user.deletion_scheduled_at:
        raise HTTPException(status_code=400, detail="No pending deletion request")
    
    if current_user.deletion_scheduled_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Deletion grace period has expired")
    
    await db.execute(
        update(User).where(User.id == current_user.id).values(
            status=UserStatus.ACTIVE,
            deletion_requested_at=None,
            deletion_scheduled_at=None,
            deletion_id=None,
            deletion_reason=None
        )
    )
    await db.commit()
    
    logger.info("deletion_cancelled", user_id=str(current_user.id), deletion_id=deletion_id)
    return {"message": "Account deletion cancelled. Your account is now active."}
