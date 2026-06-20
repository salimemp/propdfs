import uuid
from datetime import datetime, timezone
from typing import List, Optional
from pathlib import Path
import os
import tempfile

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from sqlalchemy.orm import selectinload

import structlog
from app.api.auth import get_current_active_user
from app.db.session import get_db
from app.models.database import Document, DocumentStatus, User, ProcessingTask
from app.models.schemas import (
    DocumentResponse, DocumentListResponse, DocumentUploadResponse,
    ProcessingRequest, ProcessingResponse
)
from app.services.storage_service import storage_service
from app.services.pdf_service import pdf_service
from app.core.config import get_settings

logger = structlog.get_logger()
router = APIRouter(prefix="/documents", tags=["Documents"])
settings = get_settings()


@router.post("/upload", response_model=DocumentUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # Validate file
    max_size = settings.MAX_FILE_SIZE_MB * 1024 * 1024
    content = await file.read()
    await file.seek(0)
    if len(content) > max_size:
        raise HTTPException(status_code=413, detail=f"File exceeds {settings.MAX_FILE_SIZE_MB}MB limit")

    # Validate mime type
    allowed_types = {"application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp",
                     "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                     "application/msword", "text/plain", "application/rtf"}
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=415, detail="Unsupported file type")

    # Upload to storage
    storage_key = await storage_service.upload_file(str(current_user.id), file)

    # Determine page count for PDFs
    page_count = None
    if file.content_type == "application/pdf":
        try:
            temp_path = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4().hex}.pdf")
            with open(temp_path, "wb") as f:
                f.write(content)
            info = pdf_service.get_pdf_info(temp_path)
            page_count = info.get("page_count")
            os.remove(temp_path)
        except Exception as e:
            logger.warning("pdf_info_failed", error=str(e))

    document = Document(
        user_id=current_user.id,
        filename=Path(file.filename).name,
        original_name=file.filename,
        mime_type=file.content_type or "application/octet-stream",
        file_size=len(content),
        storage_key=storage_key,
        status=DocumentStatus.COMPLETED,
        page_count=page_count,
        extra_data={"uploaded_via": "api"},
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)

    download_url = storage_service.get_presigned_url(storage_key, expires_in=3600, download=True)

    logger.info("document_uploaded", doc_id=str(document.id), user_id=str(current_user.id))
    return DocumentUploadResponse(
        id=document.id,
        filename=document.filename,
        original_name=document.original_name,
        status=document.status,
        upload_url=download_url,
        created_at=document.created_at,
    )


@router.get("/", response_model=DocumentListResponse)
async def list_documents(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[DocumentStatus] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    query = select(Document).where(Document.user_id == current_user.id)
    if status:
        query = query.where(Document.status == status)
    query = query.order_by(desc(Document.created_at))

    total_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = total_result.scalar()

    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    documents = result.scalars().all()

    return DocumentListResponse(
        items=[DocumentResponse.model_validate(d) for d in documents],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    result = await db.execute(
        select(Document).where(Document.id == document_id, Document.user_id == current_user.id)
    )
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return DocumentResponse.model_validate(document)


@router.get("/{document_id}/download")
async def download_document(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    result = await db.execute(
        select(Document).where(Document.id == document_id, Document.user_id == current_user.id)
    )
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    url = storage_service.get_presigned_url(document.storage_key, expires_in=3600, download=True)
    return {"download_url": url, "expires_in": 3600}


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    result = await db.execute(
        select(Document).where(Document.id == document_id, Document.user_id == current_user.id)
    )
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    try:
        storage_service.delete_file(document.storage_key)
    except Exception as e:
        logger.warning("storage_delete_failed", error=str(e))

    await db.delete(document)
    await db.commit()
    logger.info("document_deleted", doc_id=str(document_id), user_id=str(current_user.id))
    return None
