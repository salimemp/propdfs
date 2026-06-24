import uuid
import os
import tempfile
from datetime import datetime, timezone
from typing import List
from pathlib import Path

from celery import Celery
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.services.pdf_service import PDFProcessingService
from app.services.conversion_service import ConversionService, ConversionError
from app.services.storage_service import storage_service
from app.core.config import get_settings
from app.models.database import Document, ProcessingTask, DocumentStatus

settings = get_settings()

celery_app = Celery(
    "propdfs",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.services.celery_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=600,  # 10 minutes
    worker_prefetch_multiplier=1,
)

# Sync engine for Celery tasks — LAZY creation (not at import time)
_sync_engine = None
_sync_session = None


def _get_sync_db_url(url: str) -> str:
    """Strip asyncpg driver for sync SQLAlchemy engine (Celery, Alembic)."""
    if url.startswith("postgresql+asyncpg://"):
        return url.replace("postgresql+asyncpg://", "postgresql://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


def _get_sync_session():
    """Lazy init of sync engine — only called when a Celery task actually runs."""
    global _sync_engine, _sync_session
    if _sync_engine is None:
        _sync_engine = create_engine(_get_sync_db_url(settings.DATABASE_URL))
        _sync_session = sessionmaker(bind=_sync_engine)
    return _sync_session


def get_db_session():
    return _get_sync_session()()


pdf_service = PDFProcessingService()
conversion_service = ConversionService()


@celery_app.task(bind=True, max_retries=3)
def process_pdf_task(
    self,
    task_id: str,
    task_type: str,
    input_keys: List[str],
    user_id: str,
    params: dict,
):
    """Background task for PDF processing."""
    db = get_db_session()
    task = (
        db.query(ProcessingTask).filter(ProcessingTask.id == uuid.UUID(task_id)).first()
    )
    if not task:
        return {"error": "Task not found"}

    try:
        task.status = "processing"
        task.started_at = datetime.now(timezone.utc)
        db.commit()

        # Download input files
        temp_paths = []
        for key in input_keys:
            temp_path = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4().hex}.pdf")
            storage_service.download_file(key, temp_path)
            temp_paths.append(temp_path)

        output_path = None

        if task_type == "merge":
            output_path = pdf_service.merge_pdfs(temp_paths)
        elif task_type == "split":
            page_ranges = params.get("page_ranges", [(1, 1)])
            output_paths = pdf_service.split_pdf(temp_paths[0], page_ranges)
            output_path = output_paths[0] if output_paths else None
        elif task_type == "compress":
            quality = params.get("image_quality", 75)
            output_path = pdf_service.compress_pdf(temp_paths[0], image_quality=quality)
        elif task_type == "rotate":
            rotation = params.get("rotation", 90)
            pages = params.get("pages")
            output_path = pdf_service.rotate_pdf(
                temp_paths[0], rotation=rotation, pages=pages
            )
        elif task_type == "extract":
            pages = params.get("pages", [1])
            output_path = pdf_service.extract_pages(temp_paths[0], pages=pages)
        elif task_type == "watermark":
            text = params.get("text", "ProPDFs")
            output_path = pdf_service.add_watermark(temp_paths[0], text=text)
        elif task_type == "convert_to_images":
            output_paths = pdf_service.pdf_to_images(temp_paths[0])
            output_path = output_paths[0] if output_paths else None
        elif task_type == "images_to_pdf":
            output_path = pdf_service.images_to_pdf(temp_paths)
        elif task_type == "add_page_numbers":
            # PDF page numbering. Backend-supported since the
            # 6-deferred-items push on 2026-06-23.
            output_path = pdf_service.add_page_numbers(temp_paths[0])
        elif task_type == "organize_pages":
            # Re-arrange pages in a custom order. Input is a single
            # PDF; params is {"page_order": [3, 1, 2, ...]}.
            page_order = params.get("page_order", list(range(1, 100)))
            output_path = pdf_service.reorder_pages(temp_paths[0], page_order)
        elif task_type == "remove_pages":
            # Remove specific pages. params is {"pages_to_remove": [2, 4]}.
            pages_to_remove = set(params.get("pages_to_remove", []))
            output_path = pdf_service.remove_pages(temp_paths[0], pages_to_remove)
        # ---- Office ↔ PDF conversions via LibreOffice ----
        # The XLSX paths are known-broken in the current LibreOffice
        # build (Calc can't parse Writer HTML on import; can't parse
        # PDF meaningfully on export). They raise ConversionError
        # at runtime; the frontend marks them as coming-soon with
        # a "Calc limitation" note. Everything else works per the
        # 2026-06-21 verification matrix in the README.
        elif task_type == "word_to_pdf":
            output_path = conversion_service.convert_document(temp_paths[0], "pdf")
        elif task_type == "excel_to_pdf":
            output_path = conversion_service.convert_document(
                temp_paths[0], "pdf"
            )  # XLSX in: known limitation
        elif task_type == "ppt_to_pdf":
            output_path = conversion_service.convert_document(temp_paths[0], "pdf")
        elif task_type == "html_to_pdf":
            output_path = conversion_service.convert_document(temp_paths[0], "pdf")
        elif task_type == "pdf_to_word":
            output_path = conversion_service.convert_document(temp_paths[0], "docx")
        elif task_type == "pdf_to_excel":
            output_path = conversion_service.convert_document(
                temp_paths[0], "xlsx"
            )  # PDF → XLSX: known limitation
        elif task_type == "pdf_to_ppt":
            output_path = conversion_service.convert_document(temp_paths[0], "pptx")
        elif task_type == "pdf_to_html":
            output_path = conversion_service.convert_document(temp_paths[0], "html")
        elif task_type == "pdf_to_md":
            output_path = conversion_service.convert_document(temp_paths[0], "md")
        elif task_type == "pdf_to_odt":
            output_path = conversion_service.convert_document(temp_paths[0], "odt")
        elif task_type == "pdf_to_rtf":
            output_path = conversion_service.convert_document(temp_paths[0], "rtf")
        else:
            raise ValueError(f"Unknown task type: {task_type}")

        if output_path and os.path.exists(output_path):
            with open(output_path, "rb") as f:
                output_data = f.read()
            output_key = storage_service.upload_bytes(
                user_id, output_data, f"processed_{task_type}_{Path(output_path).name}"
            )

            task.status = "completed"
            task.result_metadata = {
                "output_key": output_key,
                "output_size": len(output_data),
            }
            task.completed_at = datetime.now(timezone.utc)
            db.commit()

            # Create output document record
            output_doc = Document(
                user_id=uuid.UUID(user_id),
                filename=f"processed_{task_type}.pdf",
                original_name=f"processed_{task_type}.pdf",
                mime_type="application/pdf",
                file_size=len(output_data),
                storage_key=output_key,
                status=DocumentStatus.COMPLETED,
                extra_data={"processed_from": input_keys, "task_type": task_type},
            )
            db.add(output_doc)
            db.commit()

            return {"status": "completed", "output_key": output_key, "task_id": task_id}
        else:
            raise Exception("Processing failed - no output file")

    except Exception as exc:
        task.status = "failed"
        task.error_message = str(exc)
        db.commit()
        self.retry(exc=exc, countdown=60)
        return {"status": "failed", "error": str(exc)}

    finally:
        # Cleanup temp files
        for path in temp_paths:
            if os.path.exists(path):
                os.remove(path)
        if output_path and os.path.exists(output_path):
            os.remove(output_path)
        db.close()
