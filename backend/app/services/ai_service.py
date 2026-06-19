import os
import tempfile
import uuid
from typing import Optional, Dict, List, AsyncIterator
from pathlib import Path
import structlog
import fitz
import google.generativeai as genai
from PIL import Image
import io
import json

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
        "summarize", "translate", "extract", "chat", "classify",
        "metadata", "proofread", "insights", "form_detect",
    }

    SUPPORTED_LANGUAGES = [
        "English", "Spanish", "French", "German", "Italian", "Portuguese",
        "Russian", "Chinese (Simplified)", "Chinese (Traditional)", "Japanese",
        "Korean", "Arabic", "Hindi", "Thai", "Vietnamese", "Polish", "Turkish",
        "Dutch", "Swedish", "Norwegian", "Danish", "Finnish", "Czech", "Hungarian",
        "Romanian", "Ukrainian", "Hebrew", "Greek", "Bengali", "Indonesian",
        "Malay", "Filipino", "Swahili", "Tamil", "Telugu", "Marathi", "Gujarati",
    ]

    def __init__(self):
        self.model = genai.GenerativeModel('gemini-1.5-flash') if settings.GEMINI_API_KEY else None
        self._vision_model = genai.GenerativeModel('gemini-1.5-flash') if settings.GEMINI_API_KEY else None

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

    async def chat_with_document(self, pdf_path: str, question: str, chat_history: List[Dict] = None) -> Dict:
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


ai_service = AIService()
