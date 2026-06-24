import os
import io
import tempfile
import uuid
from typing import List, Optional

import fitz  # PyMuPDF
import structlog
from PIL import Image

from app.core.config import get_settings

logger = structlog.get_logger()
settings = get_settings()


class PDFServiceError(Exception):
    pass


class PDFProcessingService:
    """Core PDF processing engine using PyMuPDF and PyPDF."""

    SUPPORTED_TASKS = {
        "merge",
        "split",
        "compress",
        "rotate",
        "extract",
        "watermark",
        "add_page_numbers",
        "convert_to_images",
        "images_to_pdf",
    }

    def __init__(self, work_dir: Optional[str] = None):
        self.work_dir = work_dir or tempfile.gettempdir()
        os.makedirs(self.work_dir, exist_ok=True)

    def _get_temp_path(self, suffix: str = ".pdf") -> str:
        return os.path.join(self.work_dir, f"propdfs_{uuid.uuid4().hex}{suffix}")

    def merge_pdfs(
        self, file_paths: List[str], output_path: Optional[str] = None
    ) -> str:
        """Merge multiple PDFs into a single file."""
        if len(file_paths) < 2:
            raise PDFServiceError("Need at least 2 files to merge")

        output_path = output_path or self._get_temp_path()
        merged_doc = fitz.open()

        try:
            for path in file_paths:
                if not os.path.exists(path):
                    raise PDFServiceError(f"File not found: {path}")
                doc = fitz.open(path)
                merged_doc.insert_pdf(doc)
                doc.close()
            merged_doc.save(output_path, garbage=4, deflate=True)
            logger.info("pdf_merged", input_count=len(file_paths), output=output_path)
            return output_path
        finally:
            merged_doc.close()

    def split_pdf(self, file_path: str, page_ranges: List[tuple]) -> List[str]:
        """Split a PDF into multiple files by page ranges.

        page_ranges: list of (start, end) tuples, 1-indexed, inclusive.
        """
        if not os.path.exists(file_path):
            raise PDFServiceError(f"File not found: {file_path}")

        doc = fitz.open(file_path)
        output_paths = []

        try:
            for i, (start, end) in enumerate(page_ranges):
                start_idx = max(0, start - 1)
                end_idx = min(end, doc.page_count)
                if start_idx >= end_idx:
                    continue
                new_doc = fitz.open()
                new_doc.insert_pdf(doc, from_page=start_idx, to_page=end_idx - 1)
                output_path = self._get_temp_path()
                new_doc.save(output_path, garbage=4, deflate=True)
                new_doc.close()
                output_paths.append(output_path)
            logger.info("pdf_split", input=file_path, parts=len(output_paths))
            return output_paths
        finally:
            doc.close()

    def compress_pdf(
        self,
        file_path: str,
        output_path: Optional[str] = None,
        image_quality: int = 75,
        dpi: int = 150,
    ) -> str:
        """Compress PDF by reducing image quality and removing redundant data."""
        if not os.path.exists(file_path):
            raise PDFServiceError(f"File not found: {file_path}")

        output_path = output_path or self._get_temp_path()
        doc = fitz.open(file_path)

        try:
            for page_num in range(doc.page_count):
                page = doc[page_num]
                images = page.get_images()
                for img_index, img in enumerate(images):
                    xref = img[0]
                    base_image = doc.extract_image(xref)
                    if base_image:
                        image_bytes = base_image["image"]
                        ext = base_image["ext"]
                        if ext in ("png", "bmp", "tiff"):
                            pil_img = Image.open(io.BytesIO(image_bytes))
                            if pil_img.mode in ("RGBA", "P"):
                                pil_img = pil_img.convert("RGB")
                            out = io.BytesIO()
                            pil_img.save(
                                out, format="JPEG", quality=image_quality, optimize=True
                            )
                            doc.update_image(xref, stream=out.getvalue())
                        elif ext == "jpeg":
                            pil_img = Image.open(io.BytesIO(image_bytes))
                            out = io.BytesIO()
                            pil_img.save(
                                out, format="JPEG", quality=image_quality, optimize=True
                            )
                            doc.update_image(xref, stream=out.getvalue())

            doc.save(output_path, garbage=4, deflate=True, clean=True)
            original_size = os.path.getsize(file_path)
            compressed_size = os.path.getsize(output_path)
            reduction = (1 - compressed_size / original_size) * 100
            logger.info(
                "pdf_compressed",
                original_size=original_size,
                compressed_size=compressed_size,
                reduction_pct=round(reduction, 2),
            )
            return output_path
        finally:
            doc.close()

    def rotate_pdf(
        self,
        file_path: str,
        rotation: int = 90,
        pages: Optional[List[int]] = None,
        output_path: Optional[str] = None,
    ) -> str:
        """Rotate PDF pages. rotation must be 90, 180, or 270."""
        if rotation not in (90, 180, 270):
            raise PDFServiceError("Rotation must be 90, 180, or 270")
        if not os.path.exists(file_path):
            raise PDFServiceError(f"File not found: {file_path}")

        output_path = output_path or self._get_temp_path()
        doc = fitz.open(file_path)

        try:
            target_pages = pages or list(range(1, doc.page_count + 1))
            for p in target_pages:
                if 1 <= p <= doc.page_count:
                    page = doc[p - 1]
                    page.set_rotation((page.rotation + rotation) % 360)
            doc.save(output_path, garbage=4, deflate=True)
            return output_path
        finally:
            doc.close()

    def extract_pages(
        self, file_path: str, pages: List[int], output_path: Optional[str] = None
    ) -> str:
        """Extract specific pages from a PDF."""
        if not os.path.exists(file_path):
            raise PDFServiceError(f"File not found: {file_path}")

        output_path = output_path or self._get_temp_path()
        doc = fitz.open(file_path)

        try:
            new_doc = fitz.open()
            for p in sorted(set(pages)):
                if 1 <= p <= doc.page_count:
                    new_doc.insert_pdf(doc, from_page=p - 1, to_page=p - 1)
            new_doc.save(output_path, garbage=4, deflate=True)
            new_doc.close()
            return output_path
        finally:
            doc.close()

    def reorder_pages(
        self, file_path: str, page_order: List[int], output_path: Optional[str] = None
    ) -> str:
        """Return a copy of the PDF with pages in the requested order.

        page_order is a 1-indexed list of page numbers, e.g. [3, 1, 2]
        means "page 3 first, then page 1, then page 2". Out-of-range
        or duplicate entries are silently skipped.
        """
        if not os.path.exists(file_path):
            raise PDFServiceError(f"File not found: {file_path}")
        output_path = output_path or self._get_temp_path()
        doc = fitz.open(file_path)
        try:
            new_doc = fitz.open()
            seen = set()
            for p in page_order:
                if p in seen:
                    continue
                if 1 <= p <= doc.page_count:
                    new_doc.insert_pdf(doc, from_page=p - 1, to_page=p - 1)
                    seen.add(p)
            new_doc.save(output_path, garbage=4, deflate=True)
            new_doc.close()
            return output_path
        finally:
            doc.close()

    def remove_pages(
        self, file_path: str, pages_to_remove: set, output_path: Optional[str] = None
    ) -> str:
        """Return a copy of the PDF with the given pages (1-indexed)
        removed. Pages outside the document range are ignored.
        """
        if not os.path.exists(file_path):
            raise PDFServiceError(f"File not found: {file_path}")
        output_path = output_path or self._get_temp_path()
        doc = fitz.open(file_path)
        try:
            new_doc = fitz.open()
            for p in range(1, doc.page_count + 1):
                if p in pages_to_remove:
                    continue
                new_doc.insert_pdf(doc, from_page=p - 1, to_page=p - 1)
            new_doc.save(output_path, garbage=4, deflate=True)
            new_doc.close()
            return output_path
        finally:
            doc.close()
            doc.close()

    def add_watermark(
        self,
        file_path: str,
        text: str,
        output_path: Optional[str] = None,
        opacity: float = 0.3,
        font_size: int = 48,
        color: tuple = (0.5, 0.5, 0.5),
    ) -> str:
        """Add text watermark to all pages."""
        if not os.path.exists(file_path):
            raise PDFServiceError(f"File not found: {file_path}")

        output_path = output_path or self._get_temp_path()
        doc = fitz.open(file_path)

        try:
            for page in doc:
                rect = page.rect
                center = (rect.tl + rect.br) / 2
                text_writer = fitz.TextWriter(page.rect)
                text_writer.append(center, text, fontsize=font_size)
                page.insert_textbox(
                    text_writer.text_rect,
                    text,
                    fontsize=font_size,
                    color=color,
                    overlay=True,
                )
            doc.save(output_path, garbage=4, deflate=True)
            return output_path
        finally:
            doc.close()

    def add_page_numbers(
        self,
        file_path: str,
        output_path: Optional[str] = None,
        start_number: int = 1,
        position: str = "bottom-center",
    ) -> str:
        """Add page numbers to PDF."""
        if not os.path.exists(file_path):
            raise PDFServiceError(f"File not found: {file_path}")

        output_path = output_path or self._get_temp_path()
        doc = fitz.open(file_path)

        try:
            for i, page in enumerate(doc):
                page_num = start_number + i
                rect = page.rect
                x = rect.width / 2
                y = rect.height - 30
                page.insert_text(
                    (x, y),
                    str(page_num),
                    fontsize=12,
                    color=(0, 0, 0),
                    fontname="helv",
                    overlay=True,
                )
            doc.save(output_path, garbage=4, deflate=True)
            return output_path
        finally:
            doc.close()

    def pdf_to_images(
        self, file_path: str, format: str = "png", dpi: int = 200
    ) -> List[str]:
        """Convert PDF pages to images."""
        if not os.path.exists(file_path):
            raise PDFServiceError(f"File not found: {file_path}")

        doc = fitz.open(file_path)
        output_paths = []
        zoom = dpi / 72
        mat = fitz.Matrix(zoom, zoom)

        try:
            for i in range(doc.page_count):
                page = doc[i]
                pix = page.get_pixmap(matrix=mat)
                output_path = self._get_temp_path(f".{format}")
                pix.save(output_path)
                output_paths.append(output_path)
            logger.info("pdf_to_images", pages=len(output_paths), format=format)
            return output_paths
        finally:
            doc.close()

    def images_to_pdf(
        self, image_paths: List[str], output_path: Optional[str] = None
    ) -> str:
        """Convert images to a single PDF."""
        output_path = output_path or self._get_temp_path()
        doc = fitz.open()

        try:
            for path in image_paths:
                if not os.path.exists(path):
                    raise PDFServiceError(f"Image not found: {path}")
                img = fitz.open(path)
                # `rect` would be the page bounds — kept for future use,
                # e.g. imposing a max page size on the merged output.
                # For now we just convert_to_pdf() which uses the source
                # page size directly.
                _rect = img[0].rect  # noqa: F841
                pdfbytes = img.convert_to_pdf()
                img_pdf = fitz.open("pdf", pdfbytes)
                doc.insert_pdf(img_pdf)
                img.close()
                img_pdf.close()
            doc.save(output_path, garbage=4, deflate=True)
            return output_path
        finally:
            doc.close()

    def get_pdf_info(self, file_path: str) -> dict:
        """Get metadata and page count of a PDF."""
        if not os.path.exists(file_path):
            raise PDFServiceError(f"File not found: {file_path}")

        doc = fitz.open(file_path)
        try:
            metadata = doc.metadata
            return {
                "page_count": doc.page_count,
                "title": metadata.get("title"),
                "author": metadata.get("author"),
                "subject": metadata.get("subject"),
                "creator": metadata.get("creator"),
                "producer": metadata.get("producer"),
                "creation_date": metadata.get("creationDate"),
                "modification_date": metadata.get("modDate"),
                "file_size": os.path.getsize(file_path),
                "encrypted": doc.is_encrypted,
            }
        finally:
            doc.close()


pdf_service = PDFProcessingService()
