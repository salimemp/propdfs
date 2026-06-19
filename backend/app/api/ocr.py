import uuid
import os
import tempfile
from typing import Optional, List
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession

import structlog
from app.api.auth import get_current_active_user
from app.db.session import get_db
from app.models.database import User, Document, DocumentStatus
from app.models.schemas import DocumentResponse
from app.services.ocr_service import ocr_service
from app.services.storage_service import storage_service
from app.core.config import get_settings

logger = structlog.get_logger()
router = APIRouter(prefix="/ocr", tags=["OCR"])
settings = get_settings()


@router.post("/pdf", response_model=DocumentResponse, status_code=status.HTTP_202_ACCEPTED)
async def ocr_pdf(
    file: UploadFile = File(...),
    language: str = Form("eng"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """OCR a scanned PDF to create a searchable PDF."""
    content = await file.read()
    await file.seek(0)
    
    temp_input = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4().hex}.pdf")
    with open(temp_input, 'wb') as f:
        f.write(content)
    
    try:
        output_path = ocr_service.ocr_pdf(temp_input, language=language)
        
        with open(output_path, 'rb') as f:
            output_data = f.read()
        
        output_filename = f"{Path(file.filename).stem}_ocr.pdf"
        storage_key = storage_service.upload_bytes(
            str(current_user.id), output_data, output_filename
        )
        
        document = Document(
            user_id=current_user.id,
            filename=output_filename,
            original_name=file.filename,
            mime_type="application/pdf",
            file_size=len(output_data),
            storage_key=storage_key,
            status=DocumentStatus.COMPLETED,
            metadata={"ocr": True, "language": language},
        )
        db.add(document)
        await db.commit()
        await db.refresh(document)
        
        return DocumentResponse.model_validate(document)
        
    except Exception as e:
        logger.error("ocr_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"OCR failed: {str(e)}")
    finally:
        if os.path.exists(temp_input):
            os.remove(temp_input)


@router.post("/image")
async def ocr_image(
    file: UploadFile = File(...),
    language: str = Form("eng"),
    current_user: User = Depends(get_current_active_user)
):
    """OCR an image and return extracted text."""
    content = await file.read()
    await file.seek(0)
    
    temp_input = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4().hex}.png")
    with open(temp_input, 'wb') as f:
        f.write(content)
    
    try:
        result = ocr_service.ocr_image(temp_input, language=language)
        return result
    except Exception as e:
        logger.error("ocr_image_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"OCR failed: {str(e)}")
    finally:
        if os.path.exists(temp_input):
            os.remove(temp_input)


@router.get("/languages")
async def get_supported_languages():
    """Get supported OCR languages."""
    return {
        "languages": sorted(list(ocr_service.SUPPORTED_LANGUAGES)),
    }
