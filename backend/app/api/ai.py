import uuid
import os
import tempfile
from typing import Optional, List, Dict

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    UploadFile,
    File,
    Form,
    Body,
)
from pydantic import BaseModel

import structlog
from app.api.auth import get_current_active_user
from app.models.database import User
from app.services.ai_service import ai_service
from app.core.config import get_settings

logger = structlog.get_logger()
router = APIRouter(prefix="/ai", tags=["AI Features"])
settings = get_settings()


class ChatRequest(BaseModel):
    question: str
    chat_history: Optional[List[Dict]] = None


class TranslateRequest(BaseModel):
    target_language: str


@router.post("/summarize")
async def ai_summarize(
    file: UploadFile = File(...),
    max_length: int = Form(500),
    current_user: User = Depends(get_current_active_user),
):
    """Generate AI summary of a document."""
    content = await file.read()
    await file.seek(0)

    temp_input = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4().hex}.pdf")
    with open(temp_input, "wb") as f:
        f.write(content)

    try:
        result = await ai_service.summarize(temp_input, max_length=max_length)
        return result
    except Exception as e:
        logger.error("ai_summarize_failed", error=str(e))
        raise HTTPException(
            status_code=500, detail=f"AI summarization failed: {str(e)}"
        )
    finally:
        if os.path.exists(temp_input):
            os.remove(temp_input)


@router.post("/translate")
async def ai_translate(
    file: UploadFile = File(...),
    request: TranslateRequest = Body(...),
    current_user: User = Depends(get_current_active_user),
):
    """Translate document using AI."""
    content = await file.read()
    await file.seek(0)

    temp_input = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4().hex}.pdf")
    with open(temp_input, "wb") as f:
        f.write(content)

    try:
        result = await ai_service.translate(
            temp_input, target_language=request.target_language
        )
        return result
    except Exception as e:
        logger.error("ai_translate_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"AI translation failed: {str(e)}")
    finally:
        if os.path.exists(temp_input):
            os.remove(temp_input)


@router.post("/extract")
async def ai_extract(
    file: UploadFile = File(...),
    extraction_type: str = Form("entities"),
    current_user: User = Depends(get_current_active_user),
):
    """Extract structured information from document."""
    content = await file.read()
    await file.seek(0)

    temp_input = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4().hex}.pdf")
    with open(temp_input, "wb") as f:
        f.write(content)

    try:
        result = await ai_service.extract(temp_input, extraction_type=extraction_type)
        return result
    except Exception as e:
        logger.error("ai_extract_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"AI extraction failed: {str(e)}")
    finally:
        if os.path.exists(temp_input):
            os.remove(temp_input)


@router.post("/chat")
async def ai_chat(
    file: UploadFile = File(...),
    request: ChatRequest = Body(...),
    current_user: User = Depends(get_current_active_user),
):
    """Chat with a document using AI."""
    content = await file.read()
    await file.seek(0)

    temp_input = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4().hex}.pdf")
    with open(temp_input, "wb") as f:
        f.write(content)

    try:
        result = await ai_service.chat_with_document(
            temp_input, question=request.question, chat_history=request.chat_history
        )
        return result
    except Exception as e:
        logger.error("ai_chat_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"AI chat failed: {str(e)}")
    finally:
        if os.path.exists(temp_input):
            os.remove(temp_input)


@router.post("/metadata")
async def ai_metadata(
    file: UploadFile = File(...), current_user: User = Depends(get_current_active_user)
):
    """Generate AI-powered metadata for document."""
    content = await file.read()
    await file.seek(0)

    temp_input = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4().hex}.pdf")
    with open(temp_input, "wb") as f:
        f.write(content)

    try:
        result = await ai_service.generate_metadata(temp_input)
        return result
    except Exception as e:
        logger.error("ai_metadata_failed", error=str(e))
        raise HTTPException(
            status_code=500, detail=f"AI metadata generation failed: {str(e)}"
        )
    finally:
        if os.path.exists(temp_input):
            os.remove(temp_input)


@router.post("/proofread")
async def ai_proofread(
    file: UploadFile = File(...), current_user: User = Depends(get_current_active_user)
):
    """AI proofreading and suggestions."""
    content = await file.read()
    await file.seek(0)

    temp_input = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4().hex}.pdf")
    with open(temp_input, "wb") as f:
        f.write(content)

    try:
        result = await ai_service.proofread(temp_input)
        return result
    except Exception as e:
        logger.error("ai_proofread_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"AI proofreading failed: {str(e)}")
    finally:
        if os.path.exists(temp_input):
            os.remove(temp_input)


@router.post("/insights")
async def ai_insights(
    file: UploadFile = File(...), current_user: User = Depends(get_current_active_user)
):
    """Get AI-powered document insights."""
    content = await file.read()
    await file.seek(0)

    temp_input = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4().hex}.pdf")
    with open(temp_input, "wb") as f:
        f.write(content)

    try:
        result = await ai_service.get_insights(temp_input)
        return result
    except Exception as e:
        logger.error("ai_insights_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"AI insights failed: {str(e)}")
    finally:
        if os.path.exists(temp_input):
            os.remove(temp_input)


@router.get("/languages")
async def get_supported_languages():
    """Get supported AI languages."""
    return {
        "languages": ai_service.SUPPORTED_LANGUAGES,
    }


@router.post("/vision")
async def ai_vision(
    file: UploadFile = File(...),
    task: str = Form("describe"),
    current_user: User = Depends(get_current_active_user),
):
    """Process images with AI vision."""
    content = await file.read()
    await file.seek(0)

    temp_input = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4().hex}.png")
    with open(temp_input, "wb") as f:
        f.write(content)

    try:
        result = await ai_service.process_with_vision(temp_input, task=task)
        return result
    except Exception as e:
        logger.error("ai_vision_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"AI vision failed: {str(e)}")
    finally:
        if os.path.exists(temp_input):
            os.remove(temp_input)
