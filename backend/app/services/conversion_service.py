import os
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import Optional, Dict
import structlog
import fitz

from app.core.config import get_settings

logger = structlog.get_logger()
settings = get_settings()


class ConversionError(Exception):
    pass


class ConversionService:
    """Universal document conversion engine using LibreOffice + PyMuPDF."""

    SUPPORTED_FORMATS = {
        # Office formats
        "doc",
        "docx",
        "odt",
        "rtf",
        "txt",
        "html",
        "md",
        "xls",
        "xlsx",
        "ods",
        "csv",
        "ppt",
        "pptx",
        "odp",
        "epub",
        "mobi",
        # PDF & images
        "pdf",
        "jpg",
        "jpeg",
        "png",
        "webp",
        "svg",
        "tiff",
        "bmp",
        "gif",
        "heic",
    }

    # MIME type mapping
    MIME_TYPES = {
        "doc": "application/msword",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "odt": "application/vnd.oasis.opendocument.text",
        "rtf": "application/rtf",
        "txt": "text/plain",
        "html": "text/html",
        "md": "text/markdown",
        "xls": "application/vnd.ms-excel",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "ods": "application/vnd.oasis.opendocument.spreadsheet",
        "csv": "text/csv",
        "ppt": "application/vnd.ms-powerpoint",
        "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "odp": "application/vnd.oasis.opendocument.presentation",
        "epub": "application/epub+zip",
        "mobi": "application/x-mobipocket-ebook",
        "pdf": "application/pdf",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
        "svg": "image/svg+xml",
        "tiff": "image/tiff",
        "bmp": "image/bmp",
        "gif": "image/gif",
        "heic": "image/heic",
    }

    def __init__(self, work_dir: Optional[str] = None):
        self.work_dir = work_dir or tempfile.gettempdir()
        os.makedirs(self.work_dir, exist_ok=True)
        self.libreoffice_path = self._find_libreoffice()
        logger.info("libreoffice_initialized", path=self.libreoffice_path)

    def _find_libreoffice(self) -> str:
        """Find LibreOffice binary path using shutil.which for robustness."""
        candidate_names = ["soffice", "libreoffice"]
        candidate_paths = [
            "/usr/bin/soffice",
            "/usr/bin/libreoffice",
            "/usr/lib/libreoffice/program/soffice",
            "/Applications/LibreOffice.app/Contents/MacOS/soffice",
        ]

        # Check explicit paths first
        for path in candidate_paths:
            if os.path.exists(path) and os.access(path, os.X_OK):
                return path

        # Use shutil.which for PATH-based resolution
        for name in candidate_names:
            resolved = shutil.which(name)
            if resolved:
                return resolved

        logger.warning("libreoffice_not_found_in_path", fallback="soffice")
        return "soffice"  # Fallback — will fail at runtime if not installed

    def _get_temp_path(self, suffix: str = ".pdf") -> str:
        return os.path.join(self.work_dir, f"propdfs_conv_{uuid.uuid4().hex}{suffix}")

    def _get_extension(self, filename: str) -> str:
        return Path(filename).suffix.lower().lstrip(".")

    def convert_with_libreoffice(self, input_path: str, output_format: str) -> str:
        """Convert document using LibreOffice headless."""
        if not os.path.exists(input_path):
            raise ConversionError(f"Input file not found: {input_path}")

        output_dir = tempfile.mkdtemp(prefix="propdfs_lo_")

        try:
            cmd = [
                self.libreoffice_path,
                "--headless",
                "--nologo",
                "--nolockcheck",
                "--nofirststartwizard",
                "--norestore",
                "--convert-to",
                output_format,
                "--outdir",
                output_dir,
                input_path,
            ]

            logger.info(
                "libreoffice_conversion_started",
                input=input_path,
                output_format=output_format,
                cmd=" ".join(cmd),
            )

            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

            logger.info(
                "libreoffice_conversion_completed",
                returncode=result.returncode,
                stdout=result.stdout[:500] if result.stdout else None,
                stderr=result.stderr[:500] if result.stderr else None,
            )

            if result.returncode != 0:
                raise ConversionError(
                    f"LibreOffice conversion failed (exit code {result.returncode}): {result.stderr}"
                )

            input_name = Path(input_path).stem
            output_path = os.path.join(output_dir, f"{input_name}.{output_format}")

            if not os.path.exists(output_path):
                # Try finding any file in output dir (LibreOffice sometimes renames)
                files = [
                    f
                    for f in os.listdir(output_dir)
                    if os.path.isfile(os.path.join(output_dir, f))
                ]
                if files:
                    output_path = os.path.join(output_dir, files[0])
                    logger.info(
                        "libreoffice_output_renamed",
                        expected=f"{input_name}.{output_format}",
                        actual=files[0],
                    )
                else:
                    raise ConversionError("LibreOffice produced no output file")

            # Move to final location using shutil.move (handles cross-device moves)
            final_path = self._get_temp_path(f".{output_format}")
            shutil.move(output_path, final_path)

            logger.info(
                "libreoffice_conversion_success",
                input=input_path,
                output=final_path,
                output_size=os.path.getsize(final_path),
            )
            return final_path

        except subprocess.TimeoutExpired:
            logger.error(
                "libreoffice_conversion_timeout", input=input_path, timeout=300
            )
            raise ConversionError("LibreOffice conversion timed out (300s)")
        finally:
            # Cleanup temp dir
            if os.path.exists(output_dir):
                shutil.rmtree(output_dir, ignore_errors=True)

    def convert_document(self, input_path: str, output_format: str) -> str:
        """Convert any document to target format."""
        input_ext = self._get_extension(input_path)
        output_format = output_format.lower().lstrip(".")

        if input_ext == output_format:
            return input_path  # No conversion needed

        if output_format not in self.SUPPORTED_FORMATS:
            raise ConversionError(f"Unsupported output format: {output_format}")

        # PDF as intermediate format for most conversions
        if input_ext != "pdf":
            # Convert to PDF first using LibreOffice
            pdf_path = self.convert_with_libreoffice(input_path, "pdf")
            if output_format == "pdf":
                return pdf_path
            input_path = pdf_path

        # From PDF to target format
        if output_format in ("jpg", "jpeg", "png", "webp", "tiff", "bmp"):
            return self._pdf_to_images(input_path, output_format)
        elif output_format in ("txt", "md"):
            return self._pdf_to_text(input_path, output_format)
        elif output_format in ("docx", "doc", "odt", "rtf", "html", "xlsx", "pptx"):
            return self.convert_with_libreoffice(input_path, output_format)
        elif output_format in ("epub", "mobi"):
            return self._pdf_to_ebook(input_path, output_format)
        else:
            raise ConversionError(
                f"Conversion from PDF to {output_format} not supported"
            )

    def _pdf_to_images(self, pdf_path: str, format: str) -> str:
        """Convert PDF to image(s). Returns single image path or ZIP path."""
        doc = fitz.open(pdf_path)
        try:
            if doc.page_count == 1:
                page = doc[0]
                pix = page.get_pixmap(dpi=200)
                output_path = self._get_temp_path(f".{format}")
                pix.save(output_path)
                return output_path
            else:
                # Multiple pages - create a ZIP
                import zipfile

                zip_path = self._get_temp_path(".zip")
                with zipfile.ZipFile(zip_path, "w") as zf:
                    for i in range(doc.page_count):
                        page = doc[i]
                        pix = page.get_pixmap(dpi=200)
                        img_path = os.path.join(self.work_dir, f"page_{i+1}.{format}")
                        pix.save(img_path)
                        zf.write(img_path, f"page_{i+1}.{format}")
                        os.remove(img_path)
                return zip_path
        finally:
            doc.close()

    def _pdf_to_text(self, pdf_path: str, format: str) -> str:
        """Extract text from PDF to TXT or Markdown."""
        doc = fitz.open(pdf_path)
        try:
            output_path = self._get_temp_path(f".{format}")
            with open(output_path, "w", encoding="utf-8") as f:
                for i in range(doc.page_count):
                    page = doc[i]
                    text = page.get_text()
                    if format == "md":
                        f.write(f"\n## Page {i+1}\n\n")
                        f.write(text)
                        f.write("\n---\n")
                    else:
                        f.write(f"--- Page {i+1} ---\n")
                        f.write(text)
                        f.write("\n\n")
            return output_path
        finally:
            doc.close()

    def _pdf_to_ebook(self, pdf_path: str, format: str) -> str:
        """Convert PDF to EPUB or MOBI."""
        # Use LibreOffice for EPUB, then ebook-convert for MOBI if available
        if format == "epub":
            return self.convert_with_libreoffice(pdf_path, "epub")
        else:
            # MOBI via ebook-convert (calibre) if available
            try:
                epub_path = self.convert_with_libreoffice(pdf_path, "epub")
                output_path = self._get_temp_path(".mobi")
                subprocess.run(
                    ["ebook-convert", epub_path, output_path],
                    capture_output=True,
                    timeout=120,
                )
                if os.path.exists(output_path):
                    return output_path
                # Fallback: return EPUB
                return epub_path
            except Exception:
                # Fallback to LibreOffice directly
                return self.convert_with_libreoffice(pdf_path, format)

    def get_document_info(self, file_path: str) -> Dict:
        """Get information about a document."""
        info = {
            "filename": Path(file_path).name,
            "file_size": os.path.getsize(file_path),
            "format": self._get_extension(file_path),
        }

        ext = self._get_extension(file_path)
        if ext == "pdf":
            try:
                doc = fitz.open(file_path)
                info["page_count"] = doc.page_count
                info["metadata"] = doc.metadata
                doc.close()
            except Exception:
                pass

        return info


conversion_service = ConversionService()
