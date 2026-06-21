import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

import structlog
from app.api.auth import get_current_active_user
from app.db.session import get_db
from app.models.database import User, Document, ProcessingTask
from app.models.schemas import ProcessingRequest, ProcessingResponse
from app.services.celery_tasks import process_pdf_task
from app.services.storage_service import storage_service
from app.core.config import get_settings

logger = structlog.get_logger()
router = APIRouter(prefix="/process", tags=["Processing"])
settings = get_settings()


@router.post(
    "/", response_model=ProcessingResponse, status_code=status.HTTP_202_ACCEPTED
)
async def create_processing_task(
    request: ProcessingRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    # Validate documents
    documents = []
    for doc_id in request.input_document_ids:
        result = await db.execute(
            select(Document).where(
                Document.id == doc_id, Document.user_id == current_user.id
            )
        )
        doc = result.scalar_one_or_none()
        if not doc:
            raise HTTPException(status_code=404, detail=f"Document {doc_id} not found")
        documents.append(doc)

    # Create task record
    task = ProcessingTask(
        document_id=documents[0].id,
        task_type=request.task_type,
        status="pending",
        input_params=request.params or {},
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    # Queue Celery task
    input_keys = [d.storage_key for d in documents]
    celery_result = process_pdf_task.delay(
        task_id=str(task.id),
        task_type=request.task_type,
        input_keys=input_keys,
        user_id=str(current_user.id),
        params=request.params or {},
    )

    # Update task with celery ID
    task.celery_task_id = celery_result.id
    await db.commit()

    logger.info(
        "processing_task_queued",
        task_id=str(task.id),
        task_type=request.task_type,
        user_id=str(current_user.id),
    )

    return ProcessingResponse(
        id=task.id,
        task_type=task.task_type,
        status=task.status,
        celery_task_id=task.celery_task_id,
        result_url=None,
        created_at=task.created_at,
        completed_at=None,
    )


@router.get("/{task_id}", response_model=ProcessingResponse)
async def get_task_status(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await db.execute(
        select(ProcessingTask)
        .options(selectinload(ProcessingTask.document))
        .where(ProcessingTask.id == task_id)
    )
    task = result.scalar_one_or_none()
    if not task or task.document.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Task not found")

    result_url = None
    if task.status == "completed" and task.result_metadata:
        output_key = task.result_metadata.get("output_key")
        if output_key:
            result_url = storage_service.get_presigned_url(output_key, expires_in=3600)

    return ProcessingResponse(
        id=task.id,
        task_type=task.task_type,
        status=task.status,
        celery_task_id=task.celery_task_id,
        result_url=result_url,
        created_at=task.created_at,
        completed_at=task.completed_at,
    )
