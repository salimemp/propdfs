import uuid
import os
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession

import structlog
from app.api.auth import get_current_active_user
from app.db.session import get_db
from app.models.database import User, Document, DocumentStatus
from app.models.schemas import DocumentResponse
from app.services.conversion_service import conversion_service
from app.services.storage_service import storage_service
from app.core.config import get_settings

logger = structlog.get_logger()
router = APIRouter(prefix="/convert", tags=["Conversion"])
settings = get_settings()


@router.post("/", response_model=DocumentResponse, status_code=status.HTTP_202_ACCEPTED)
async def convert_document(
    file: UploadFile = File(...),
    output_format: str = Form(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Convert a document to any supported format."""
    # Validate file
    max_size = settings.MAX_FILE_SIZE_MB * 1024 * 1024
    content = await file.read()
    await file.seek(0)
    if len(content) > max_size:
        raise HTTPException(
            status_code=413, detail=f"File exceeds {settings.MAX_FILE_SIZE_MB}MB limit"
        )

    # Save to temp file
    input_ext = Path(file.filename).suffix.lower().lstrip(".")
    temp_input = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4().hex}.{input_ext}")
    with open(temp_input, "wb") as f:
        f.write(content)

    try:
        # Convert
        output_path = conversion_service.convert_document(temp_input, output_format)

        # Read output and upload
        with open(output_path, "rb") as f:
            output_data = f.read()

        output_filename = f"{Path(file.filename).stem}.{output_format}"
        storage_key = storage_service.upload_bytes(
            str(current_user.id), output_data, output_filename
        )

        # Create document record
        mime_type = conversion_service.MIME_TYPES.get(
            output_format, "application/octet-stream"
        )
        document = Document(
            user_id=current_user.id,
            filename=output_filename,
            original_name=file.filename,
            mime_type=mime_type,
            file_size=len(output_data),
            storage_key=storage_key,
            status=DocumentStatus.COMPLETED,
            extra_data={"converted_from": input_ext, "converted_to": output_format},
        )
        db.add(document)
        await db.commit()
        await db.refresh(document)

        logger.info(
            "document_converted",
            user_id=str(current_user.id),
            from_format=input_ext,
            to_format=output_format,
        )

        return DocumentResponse.model_validate(document)

    except Exception as e:
        logger.error("conversion_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Conversion failed: {str(e)}")
    finally:
        # Cleanup
        if os.path.exists(temp_input):
            os.remove(temp_input)


@router.get("/formats")
async def get_supported_formats():
    """Get list of supported conversion formats."""
    return {
        "input_formats": list(conversion_service.SUPPORTED_FORMATS),
        "output_formats": list(conversion_service.SUPPORTED_FORMATS),
        "mime_types": conversion_service.MIME_TYPES,
    }
