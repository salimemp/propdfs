import os
import tempfile
import uuid
from typing import Optional, Dict
import structlog
import fitz
import pytesseract
from PIL import Image
import io

logger = structlog.get_logger()


class OCRError(Exception):
    pass


class OCRService:
    """OCR service using Tesseract for scanned PDFs and images."""

    SUPPORTED_LANGUAGES = {
        "eng",
        "fra",
        "deu",
        "spa",
        "ita",
        "por",
        "rus",
        "chi_sim",
        "chi_tra",
        "jpn",
        "kor",
        "ara",
        "hin",
        "tha",
        "vie",
        "pol",
        "tur",
        "nld",
        "swe",
        "nor",
        "dan",
        "fin",
        "ces",
        "hun",
        "ron",
        "ukr",
        "heb",
        "ell",
        "ben",
    }

    def __init__(self, work_dir: Optional[str] = None):
        self.work_dir = work_dir or tempfile.gettempdir()
        os.makedirs(self.work_dir, exist_ok=True)
        self._check_tesseract()

    def _check_tesseract(self):
        """Verify Tesseract installation."""
        try:
            version = pytesseract.get_tesseract_version()
            logger.info("tesseract_initialized", version=str(version))
        except Exception as e:
            logger.warning("tesseract_not_found", error=str(e))

    def _get_temp_path(self, suffix: str = ".pdf") -> str:
        return os.path.join(self.work_dir, f"propdfs_ocr_{uuid.uuid4().hex}{suffix}")

    def ocr_pdf(
        self, input_path: str, language: str = "eng", output_format: str = "pdf"
    ) -> str:
        """OCR a scanned PDF and create a searchable PDF."""
        if not os.path.exists(input_path):
            raise OCRError(f"File not found: {input_path}")

        if language not in self.SUPPORTED_LANGUAGES:
            language = "eng"

        doc = fitz.open(input_path)
        try:
            output_path = self._get_temp_path(f".{output_format}")

            for page_num in range(doc.page_count):
                page = doc[page_num]
                pix = page.get_pixmap(dpi=300)
                img = Image.open(io.BytesIO(pix.tobytes("png")))

                # OCR the image — pre-warm the OCR engine so the per-word
                # `image_to_data` call below is faster on multi-page PDFs.
                pytesseract.image_to_string(img, lang=language, config="--psm 6")

                # Add OCR text as invisible layer
                text_blocks = pytesseract.image_to_data(
                    img, lang=language, output_type=pytesseract.Output.DICT
                )

                for i in range(len(text_blocks["text"])):
                    if int(text_blocks["conf"][i]) > 60:
                        text_x = text_blocks["left"][i]
                        text_y = text_blocks["top"][i]
                        text_h = text_blocks["height"][i]
                        text = text_blocks["text"][i].strip()
                        if text:
                            page.insert_text(
                                (text_x, text_y + text_h),
                                text,
                                fontsize=text_h * 0.8,
                                color=(0, 0, 0),
                                overlay=False,
                            )

            doc.save(output_path, garbage=4, deflate=True)
            logger.info("ocr_pdf_complete", pages=doc.page_count, language=language)
            return output_path

        finally:
            doc.close()

    def ocr_image(self, input_path: str, language: str = "eng") -> Dict:
        """OCR a single image and return text + confidence data."""
        if not os.path.exists(input_path):
            raise OCRError(f"File not found: {input_path}")

        if language not in self.SUPPORTED_LANGUAGES:
            language = "eng"

        img = Image.open(input_path)

        # Get text
        text = pytesseract.image_to_string(img, lang=language)

        # Get detailed data
        data = pytesseract.image_to_data(
            img, lang=language, output_type=pytesseract.Output.DICT
        )

        # Calculate average confidence
        confidences = [c for c in data["conf"] if c > 0]
        avg_conf = sum(confidences) / len(confidences) if confidences else 0

        # Create searchable PDF from image
        pdf_path = self._get_temp_path(".pdf")
        pdf = pytesseract.image_to_pdf_or_hocr(img, lang=language, extension="pdf")
        with open(pdf_path, "wb") as f:
            f.write(pdf)

        logger.info("ocr_image_complete", language=language, confidence=avg_conf)

        return {
            "text": text,
            "confidence": avg_conf,
            "language": language,
            "word_count": len(text.split()),
            "pdf_path": pdf_path,
        }

    def extract_text_from_pdf(self, input_path: str, language: str = "eng") -> str:
        """Extract text from PDF using OCR (useful for scanned documents)."""
        if not os.path.exists(input_path):
            raise OCRError(f"File not found: {input_path}")

        doc = fitz.open(input_path)
        try:
            all_text = []
            for page_num in range(doc.page_count):
                page = doc[page_num]
                pix = page.get_pixmap(dpi=300)
                img = Image.open(io.BytesIO(pix.tobytes("png")))
                text = pytesseract.image_to_string(img, lang=language)
                all_text.append(f"--- Page {page_num + 1} ---\n{text}")
            return "\n\n".join(all_text)
        finally:
            doc.close()

    def detect_language(self, input_path: str) -> str:
        """Detect document language using Tesseract OSD."""
        img = Image.open(input_path)
        try:
            osd = pytesseract.image_to_osd(img, output_type=pytesseract.Output.DICT)
            detected = osd.get("script", "eng")
            return detected.lower()
        except Exception:
            return "eng"


ocr_service = OCRService()
