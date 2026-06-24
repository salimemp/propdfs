from typing import Dict, List
import json
import structlog
import fitz
import google.generativeai as genai
from PIL import Image
import io

from app.core.config import get_settings

logger = structlog.get_logger()
settings = get_settings()

if settings.GEMINI_API_KEY:
    genai.configure(api_key=settings.GEMINI_API_KEY)


class AIError(Exception):
    pass


class AIService:
    """AI document intelligence using Google Gemini."""

    SUPPORTED_TASKS = {
        "summarize",
        "translate",
        "extract",
        "chat",
        "classify",
        "metadata",
        "proofread",
        "insights",
        "form_detect",
    }

    SUPPORTED_LANGUAGES = [
        "English",
        "Spanish",
        "French",
        "German",
        "Italian",
        "Portuguese",
        "Russian",
        "Chinese (Simplified)",
        "Chinese (Traditional)",
        "Japanese",
        "Korean",
        "Arabic",
        "Hindi",
        "Thai",
        "Vietnamese",
        "Polish",
        "Turkish",
        "Dutch",
        "Swedish",
        "Norwegian",
        "Danish",
        "Finnish",
        "Czech",
        "Hungarian",
        "Romanian",
        "Ukrainian",
        "Hebrew",
        "Greek",
        "Bengali",
        "Indonesian",
        "Malay",
        "Filipino",
        "Swahili",
        "Tamil",
        "Telugu",
        "Marathi",
        "Gujarati",
    ]

    def __init__(self):
        self.model = (
            genai.GenerativeModel("gemini-1.5-flash")
            if settings.GEMINI_API_KEY
            else None
        )
        self._vision_model = (
            genai.GenerativeModel("gemini-1.5-flash")
            if settings.GEMINI_API_KEY
            else None
        )

    def _get_model(self):
        if not self.model:
            raise AIError("Gemini API key not configured")
        return self.model

    def _extract_text_from_pdf(self, pdf_path: str) -> str:
        """Extract text from PDF for AI processing."""
        doc = fitz.open(pdf_path)
        try:
            texts = []
            for page in doc:
                texts.append(page.get_text())
            return "\n".join(texts)
        finally:
            doc.close()

    def _pdf_page_to_image(self, pdf_path: str, page_num: int = 0) -> Image.Image:
        """Convert PDF page to PIL Image."""
        doc = fitz.open(pdf_path)
        try:
            page = doc[page_num]
            pix = page.get_pixmap(dpi=150)
            return Image.open(io.BytesIO(pix.tobytes("png")))
        finally:
            doc.close()

    async def summarize(self, pdf_path: str, max_length: int = 500) -> Dict:
        """Generate document summary."""
        text = self._extract_text_from_pdf(pdf_path)
        if len(text) > 30000:
            text = text[:30000] + "..."

        prompt = f"""Summarize the following document in a clear, concise manner.
        Provide:
        1. A brief overview (2-3 sentences)
        2. Key points (bullet list)
        3. Main topics covered
        
        Document:
        {text}
        """

        response = await self._get_model().generate_content_async(prompt)
        summary = response.text

        return {
            "task": "summarize",
            "summary": summary,
            "original_length": len(text),
            "summary_length": len(summary),
        }

    async def translate(self, pdf_path: str, target_language: str) -> Dict:
        """Translate document content."""
        text = self._extract_text_from_pdf(pdf_path)
        if len(text) > 30000:
            text = text[:30000] + "..."

        prompt = f"""Translate the following document to {target_language}.
        Maintain formatting, structure, and technical terminology accuracy.
        
        Document:
        {text}
        """

        response = await self._get_model().generate_content_async(prompt)
        translated = response.text

        return {
            "task": "translate",
            "target_language": target_language,
            "translated_text": translated,
        }

    async def extract(self, pdf_path: str, extraction_type: str = "entities") -> Dict:
        """Extract structured information from document."""
        text = self._extract_text_from_pdf(pdf_path)

        prompts = {
            "entities": "Extract all named entities (people, organizations, locations, dates) from this document. Return as JSON.",
            "key_data": "Extract key data points, statistics, and facts from this document. Return as JSON.",
            "tables": "Extract any table data from this document. Return as markdown tables.",
            "contacts": "Extract all contact information (emails, phones, addresses) from this document. Return as JSON.",
        }

        prompt = f"""{prompts.get(extraction_type, prompts['entities'])}
        
        Document:
        {text[:20000]}
        """

        response = await self._get_model().generate_content_async(prompt)

        return {
            "task": "extract",
            "extraction_type": extraction_type,
            "extracted_data": response.text,
        }

    async def chat_with_document(
        self, pdf_path: str, question: str, chat_history: List[Dict] = None
    ) -> Dict:
        """Chat with document using RAG-style Q&A."""
        text = self._extract_text_from_pdf(pdf_path)
        if len(text) > 30000:
            text = text[:30000] + "..."

        prompt = f"""You are a document analysis assistant. Answer the question based ONLY on the provided document content.
        If the answer is not in the document, say "I don't find this information in the document."
        
        Document:
        {text}
        
        Question: {question}
        """

        response = await self._get_model().generate_content_async(prompt)

        return {
            "task": "chat",
            "question": question,
            "answer": response.text,
        }

    async def generate_metadata(self, pdf_path: str) -> Dict:
        """Generate document metadata using AI."""
        text = self._extract_text_from_pdf(pdf_path)
        if len(text) > 10000:
            text = text[:10000]

        prompt = f"""Analyze this document and generate metadata:
        1. Title (suggested)
        2. Author (if identifiable)
        3. Subject/Category
        4. Keywords (5-10)
        5. Language
        6. Document type
        7. Reading time estimate
        
        Return as JSON format.
        
        Document:
        {text}
        """

        response = await self._get_model().generate_content_async(prompt)

        return {
            "task": "metadata",
            "ai_metadata": response.text,
        }

    async def proofread(self, pdf_path: str) -> Dict:
        """Proofread and suggest improvements."""
        text = self._extract_text_from_pdf(pdf_path)

        prompt = f"""Proofread the following document. For each issue found, provide:
        1. The original text
        2. The suggested correction
        3. The type of issue (grammar, spelling, style, clarity)
        
        Return as a structured list.
        
        Document:
        {text[:20000]}
        """

        response = await self._get_model().generate_content_async(prompt)

        return {
            "task": "proofread",
            "suggestions": response.text,
        }

    async def get_insights(self, pdf_path: str) -> Dict:
        """Get AI-powered document insights."""
        text = self._extract_text_from_pdf(pdf_path)
        if len(text) > 15000:
            text = text[:15000]

        prompt = f"""Analyze this document and provide insights:
        1. Sentiment analysis
        2. Reading difficulty level
        3. Key themes
        4. Action items (if any)
        5. Suggested follow-up questions
        6. Potential audience
        
        Document:
        {text}
        """

        response = await self._get_model().generate_content_async(prompt)

        return {
            "task": "insights",
            "insights": response.text,
        }

    async def process_with_vision(self, image_path: str, task: str) -> Dict:
        """Process images using Gemini vision capabilities."""
        img = Image.open(image_path)

        prompts = {
            "describe": "Describe this image in detail.",
            "extract_text": "Extract all text visible in this image. Return as plain text.",
            "analyze": "Analyze this document image and provide key information.",
        }

        prompt = prompts.get(task, prompts["describe"])

        response = await self._vision_model.generate_content_async([prompt, img])

        return {
            "task": f"vision_{task}",
            "result": response.text,
        }

    # ------------------------------------------------------------------
    # AI Fill Forms
    #
    # Two-phase flow:
    #   1. Read the PDF's AcroForm fields (name + nearby text) and
    #      the document body for context.
    #   2. Hand both to Gemini; ask for one suggested value per
    #      field, returned as a JSON map.
    #
    # The actual write-back to the PDF happens at the API layer
    # (see api/ai.py::ai_fill_forms) so the service stays
    # format-agnostic and easy to test in isolation.
    # ------------------------------------------------------------------
    async def fill_forms(self, pdf_path: str) -> Dict:
        """Read AcroForm fields + doc text, ask Gemini for values.

        Returns a dict shaped as:
          {
              "fields": [
                  {"name": "applicant_name", "value": "Jane Doe",
                   "type": "Tx", "page": 1, "reason": "..."},
                  ...
              ],
              "context_chars": 12345,
          }

        Empty / non-form PDFs return an empty `fields` list with
        a note in `reason`.
        """
        import pikepdf  # local import: keeps the top of the file

        # clean for callers that don't need form handling.

        # Pull the form field names from the AcroForm dictionary.
        # pikepdf gives us the names without doing a text-extract
        # pass first, so this is fast even for big documents.
        field_names: list[dict] = []
        try:
            with pikepdf.open(pdf_path) as pdf:
                root = pdf.Root
                if "/AcroForm" in root:
                    acroform = root.Acroform
                    if "/Fields" in acroform:
                        # The field list is a tree — flatten it so
                        # the response is just a flat list of
                        # concrete fields (Tx, Btn, Ch, Sig).
                        stack = list(acroform.Fields)
                        while stack:
                            f = stack.pop()
                            # Sub-form groups have /Kids but no /T
                            # (or /FT); recurse into them.
                            if "/Kids" in f and "/FT" not in f:
                                stack.extend(f.Kids)
                                continue
                            name = str(f.T) if "/T" in f else None
                            if not name:
                                continue
                            ft = str(f.FT) if "/FT" in f else "Tx"
                            # 0-indexed page reference: /P is the
                            # page object the field lives on. We
                            # convert to a 1-based page number for
                            # the user-facing response.
                            page_num = None
                            if "/P" in f:
                                try:
                                    # Find the page index in the
                                    # parent pdf.pages list.
                                    pages = list(pdf.pages)
                                    page_num = (
                                        pages.index(f.P) + 1 if f.P in pages else None
                                    )
                                except Exception:
                                    page_num = None
                            field_names.append(
                                {
                                    "name": name,
                                    "type": ft,
                                    "page": page_num,
                                }
                            )
        except Exception:
            # If pikepdf can't open the file, just return empty —
            # the API layer will surface a 500 if the file is
            # truly unreadable.
            field_names = []

        if not field_names:
            return {
                "fields": [],
                "context_chars": 0,
                "reason": "No AcroForm fields found in this PDF.",
            }

        # Pull a manageable slice of the document text as
        # context. Same 30k cap the other AI endpoints use.
        text = self._extract_text_from_pdf(pdf_path)
        if len(text) > 30000:
            text = text[:30000] + "..."

        field_list = "\n".join(
            f"- {f['name']} (type={f['type']}, page={f['page']})" for f in field_names
        )

        prompt = f"""You are filling in an AcroForm PDF based on the document's own content.

Document content (may be truncated):
\"\"\"
{text}
\"\"\"

Form fields to fill:
{field_list}

For each field, suggest a value derived from the document content.
If the document does not contain enough information to fill a
field, return an empty string for that field.

Return ONLY a JSON object in this exact shape — no commentary, no markdown fences:
{{
  "<field_name>": "<value or empty string>",
  ...
}}
"""

        response = await self._get_model().generate_content_async(prompt)
        raw = response.text.strip()

        # Gemini sometimes wraps the JSON in ```json ... ``` fences
        # even when asked not to. Strip them defensively.
        if raw.startswith("```"):
            raw = raw.split("```", 2)[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.rsplit("```", 1)[0].strip()

        try:
            values = json.loads(raw)
        except json.JSONDecodeError:
            # If Gemini returned something we can't parse, fall
            # back to "fill nothing" rather than 500. The user
            # can retry; the issue is usually a malformed response
            # from a model hiccup.
            return {
                "fields": [
                    {**f, "value": "", "reason": "Model returned non-JSON."}
                    for f in field_names
                ],
                "context_chars": len(text),
                "reason": "The model returned a non-JSON response. "
                "Try again with a smaller document.",
            }

        merged = []
        for f in field_names:
            val = values.get(f["name"], "")
            if not isinstance(val, str):
                val = str(val) if val is not None else ""
            merged.append({**f, "value": val})

        return {
            "fields": merged,
            "context_chars": len(text),
        }


ai_service = AIService()
