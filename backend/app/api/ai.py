import uuid
import os
import tempfile
from typing import Optional, List, Dict

import pikepdf
from fastapi import Request

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    UploadFile,
    File,
    Form,
    Body,
)
from fastapi.responses import Response
from pydantic import BaseModel

import structlog
from app.api.auth import get_current_active_user
from app.models.database import User
from app.services.ai_service import ai_service
from app.core.config import get_settings
from app.core.quota import QuotaFeature, check_and_increment

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
    request: Request,
    file: UploadFile = File(...),
    max_length: int = Form(500),
    current_user: User = Depends(get_current_active_user),
):

    # Per-user daily quota — increments atomically, 429 if over cap.
    redis_client = getattr(request.app.state, "redis", None)
    if redis_client is not None:
        await check_and_increment(
            redis_client,
            user_id=str(current_user.id),
            plan=current_user.plan_tier,
            feature=QuotaFeature.AI,
        )

    """Generate AI summary of a document."""
    # Per-user daily quota — counter increments atomically,
    # 429 with structured detail if the user is over their cap.
    redis_client = getattr(request.app.state, "redis", None)
    if redis_client is not None:
        await check_and_increment(
            redis_client,
            user_id=str(current_user.id),
            plan=current_user.plan_tier,
            feature=QuotaFeature.AI,
        )

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
    request: Request,
    file: UploadFile = File(...),
    extraction_type: str = Form("entities"),
    current_user: User = Depends(get_current_active_user),
):

    # Per-user daily quota — increments atomically, 429 if over cap.
    redis_client = getattr(request.app.state, "redis", None)
    if redis_client is not None:
        await check_and_increment(
            redis_client,
            user_id=str(current_user.id),
            plan=current_user.plan_tier,
            feature=QuotaFeature.AI,
        )

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
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
):

    # Per-user daily quota — increments atomically, 429 if over cap.
    redis_client = getattr(request.app.state, "redis", None)
    if redis_client is not None:
        await check_and_increment(
            redis_client,
            user_id=str(current_user.id),
            plan=current_user.plan_tier,
            feature=QuotaFeature.AI,
        )

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
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
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
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
):

    # Per-user daily quota — increments atomically, 429 if over cap.
    redis_client = getattr(request.app.state, "redis", None)
    if redis_client is not None:
        await check_and_increment(
            redis_client,
            user_id=str(current_user.id),
            plan=current_user.plan_tier,
            feature=QuotaFeature.AI,
        )

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
    request: Request,
    file: UploadFile = File(...),
    task: str = Form("describe"),
    current_user: User = Depends(get_current_active_user),
):

    # Per-user daily quota — increments atomically, 429 if over cap.
    redis_client = getattr(request.app.state, "redis", None)
    if redis_client is not None:
        await check_and_increment(
            redis_client,
            user_id=str(current_user.id),
            plan=current_user.plan_tier,
            feature=QuotaFeature.AI,
        )

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


# ------------------------------------------------------------------
# AI Fill Forms
#
# Two-step flow for the Flutter page:
#   1. POST /ai/fill-forms (multipart, file=<pdf>) →
#        {"fields": [{name, value, type, page, reason?}, ...],
#         "context_chars": int, "reason"?: str}
#      The page renders the suggested values in editable form so
#      the user can correct anything before committing.
#   2. POST /ai/fill-forms/apply (multipart, file=<pdf>,
#        fields=<json of {name: value}>) → application/pdf
#      (the filled PDF as a download).
#
# The two-step shape matters: we never want to silently trust
# Gemini's answers for a form someone is about to sign. Always
# show the human what the model proposed.
# ------------------------------------------------------------------
@router.post("/fill-forms")
async def ai_fill_forms(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
):
    """Read AcroForm fields + ask Gemini for suggested values.

    Returns the suggestions as JSON. The Flutter page lets the
    user review + edit them, then POSTs to /ai/fill-forms/apply
    to commit.
    """
    content = await file.read()
    await file.seek(0)

    temp_input = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4().hex}.pdf")
    with open(temp_input, "wb") as f:
        f.write(content)

    try:
        result = await ai_service.fill_forms(temp_input)
        return result
    except Exception as e:
        logger.error("ai_fill_forms_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"AI fill-forms failed: {str(e)}")
    finally:
        if os.path.exists(temp_input):
            os.remove(temp_input)


@router.post("/fill-forms/apply")
async def ai_fill_forms_apply(
    request: Request,
    file: UploadFile = File(...),
    fields: str = Form(...),
    current_user: User = Depends(get_current_active_user),
):

    # Per-user daily quota — increments atomically, 429 if over cap.
    redis_client = getattr(request.app.state, "redis", None)
    if redis_client is not None:
        await check_and_increment(
            redis_client,
            user_id=str(current_user.id),
            plan=current_user.plan_tier,
            feature=QuotaFeature.AI,
        )

    """Write the user-approved field values back into the PDF.

    `fields` is a JSON string of {name: value}. The endpoint opens
    the source PDF with pikepdf, walks the AcroForm tree, sets
    /V on each matching field, and returns the filled PDF as
    a download.
    """
    import json as _json

    try:
        values = _json.loads(fields)
    except _json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"fields must be valid JSON: {e}")
    if not isinstance(values, dict):
        raise HTTPException(status_code=400, detail="fields must be a JSON object")

    content = await file.read()
    await file.seek(0)

    src_path = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4().hex}_src.pdf")
    out_path = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4().hex}_filled.pdf")
    with open(src_path, "wb") as f:
        f.write(content)

    try:
        with pikepdf.open(src_path) as pdf:
            if "/AcroForm" not in pdf.Root:
                raise HTTPException(
                    status_code=400,
                    detail="This PDF has no AcroForm fields to fill.",
                )
            acroform = pdf.Root.Acroform
            if "/Fields" not in acroform:
                raise HTTPException(
                    status_code=400,
                    detail="This PDF has no AcroForm fields to fill.",
                )

            # Walk the field tree. Set /V on each concrete field
            # whose /T matches a key in the user's values dict.
            # Empty-string values are still applied (a user might
            # want to clear a field).
            written = 0
            stack = list(acroform.Fields)
            while stack:
                f = stack.pop()
                if "/Kids" in f and "/FT" not in f:
                    stack.extend(f.Kids)
                    continue
                if "/T" not in f:
                    continue
                name = str(f.T)
                if name in values:
                    val = values[name]
                    if val is None or val == "":
                        # Clear the field by deleting /V.
                        if "/V" in f:
                            del f.V
                    else:
                        f.V = str(val)
                    written += 1

            # Mark the form as needing a re-render so the new
            # values show up in any viewer.
            if "/NeedAppearances" in acroform:
                acroform.NeedAppearances = True
            else:
                acroform.NeedAppearances = True

            pdf.save(out_path)

        with open(out_path, "rb") as f:
            filled_bytes = f.read()

        return Response(
            content=filled_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": 'attachment; filename="filled.pdf"',
                "X-ProPDFs-Fields-Written": str(written),
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("ai_fill_forms_apply_failed", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to apply field values: {str(e)}",
        )
    finally:
        for p in (src_path, out_path):
            if os.path.exists(p):
                os.remove(p)
