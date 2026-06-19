import pytest
import os
import tempfile
import uuid
from datetime import datetime, timezone, timedelta
from unittest.mock import Mock, patch, AsyncMock

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.core.config import get_settings
from app.core.security import hash_password, create_access_token
from app.models.database import Base, User, UserStatus, PlanTier, Document, DocumentStatus
from app.services.pdf_service import PDFProcessingService, PDFServiceError
from app.services.conversion_service import ConversionService, ConversionError
from app.services.ocr_service import OCRService, OCRError
from app.services.ai_service import AIService, AIError
from app.models.beta import BetaUser, BetaWaitlist

# Override settings for testing
settings = get_settings()
settings.DATABASE_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/propdfs_test"
settings.SECRET_KEY = "test-secret-key-32-chars-long!!!"

client = TestClient(app)


class TestAuthentication:
    """Test authentication endpoints."""

    def test_health_check(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"

    def test_register_validation(self):
        response = client.post("/api/v1/auth/register", json={
            "email": "invalid-email",
            "password": "short"
        })
        assert response.status_code == 422

    def test_login_invalid_credentials(self):
        response = client.post("/api/v1/auth/login", json={
            "email": "nonexistent@example.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401


class TestPDFService:
    """Test PDF processing engine."""

    def test_merge_pdfs_insufficient_files(self):
        service = PDFProcessingService()
        with pytest.raises(PDFServiceError):
            service.merge_pdfs(["file1.pdf"])

    def test_merge_pdfs_file_not_found(self):
        service = PDFProcessingService()
        with pytest.raises(PDFServiceError):
            service.merge_pdfs(["nonexistent1.pdf", "nonexistent2.pdf"])

    def test_rotate_pdf_invalid_rotation(self):
        service = PDFProcessingService()
        with pytest.raises(PDFServiceError):
            service.rotate_pdf("test.pdf", rotation=45)

    def test_get_pdf_info_file_not_found(self):
        service = PDFProcessingService()
        with pytest.raises(PDFServiceError):
            service.get_pdf_info("nonexistent.pdf")

    def test_compress_pdf_file_not_found(self):
        service = PDFProcessingService()
        with pytest.raises(PDFServiceError):
            service.compress_pdf("nonexistent.pdf")


class TestConversionService:
    """Test document conversion engine."""

    def test_conversion_formats(self):
        service = ConversionService()
        assert "pdf" in service.SUPPORTED_FORMATS
        assert "docx" in service.SUPPORTED_FORMATS
        assert "xlsx" in service.SUPPORTED_FORMATS
        assert "pptx" in service.SUPPORTED_FORMATS
        assert "jpg" in service.SUPPORTED_FORMATS
        assert "png" in service.SUPPORTED_FORMATS
        assert "epub" in service.SUPPORTED_FORMATS

    def test_mime_types(self):
        service = ConversionService()
        assert service.MIME_TYPES["pdf"] == "application/pdf"
        assert service.MIME_TYPES["docx"] == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        assert service.MIME_TYPES["jpg"] == "image/jpeg"

    def test_convert_document_file_not_found(self):
        service = ConversionService()
        with pytest.raises(ConversionError):
            service.convert_document("nonexistent.docx", "pdf")

    def test_get_extension(self):
        service = ConversionService()
        assert service._get_extension("test.pdf") == "pdf"
        assert service._get_extension("file.DOCX") == "docx"
        assert service._get_extension("image.PNG") == "png"


class TestOCRService:
    """Test OCR service."""

    def test_supported_languages(self):
        service = OCRService()
        assert "eng" in service.SUPPORTED_LANGUAGES
        assert "fra" in service.SUPPORTED_LANGUAGES
        assert "deu" in service.SUPPORTED_LANGUAGES
        assert "chi_sim" in service.SUPPORTED_LANGUAGES
        assert "jpn" in service.SUPPORTED_LANGUAGES
        assert "ara" in service.SUPPORTED_LANGUAGES

    def test_ocr_pdf_file_not_found(self):
        service = OCRService()
        with pytest.raises(OCRError):
            service.ocr_pdf("nonexistent.pdf")

    def test_ocr_image_file_not_found(self):
        service = OCRService()
        with pytest.raises(OCRError):
            service.ocr_image("nonexistent.png")

    def test_extract_text_from_pdf_file_not_found(self):
        service = OCRService()
        with pytest.raises(OCRError):
            service.extract_text_from_pdf("nonexistent.pdf")


class TestAIService:
    """Test AI service."""

    def test_supported_tasks(self):
        service = AIService()
        assert "summarize" in service.SUPPORTED_TASKS
        assert "translate" in service.SUPPORTED_TASKS
        assert "extract" in service.SUPPORTED_TASKS
        assert "chat" in service.SUPPORTED_TASKS
        assert "classify" in service.SUPPORTED_TASKS

    def test_supported_languages(self):
        service = AIService()
        assert "English" in service.SUPPORTED_LANGUAGES
        assert "Spanish" in service.SUPPORTED_LANGUAGES
        assert "French" in service.SUPPORTED_LANGUAGES
        assert "Chinese (Simplified)" in service.SUPPORTED_LANGUAGES
        assert "Japanese" in service.SUPPORTED_LANGUAGES
        assert "Arabic" in service.SUPPORTED_LANGUAGES

    def test_extract_text_from_pdf_file_not_found(self):
        service = AIService()
        with pytest.raises(Exception):
            service._extract_text_from_pdf("nonexistent.pdf")


class TestBetaModels:
    """Test beta program models."""

    def test_beta_user_creation(self):
        beta_user = BetaUser(
            user_id=uuid.uuid4(),
            beta_expires_at=datetime.now(timezone.utc) + timedelta(days=90),
            referral_code="PROP1234",
        )
        assert beta_user.is_active == True
        assert beta_user.referrals_count == 0
        assert beta_user.total_files_processed == 0

    def test_beta_waitlist_creation(self):
        waitlist = BetaWaitlist(
            email="test@example.com",
            full_name="Test User",
            position=1,
        )
        assert waitlist.status == "pending"
        assert waitlist.position == 1

    def test_beta_user_referral(self):
        beta_user = BetaUser(
            user_id=uuid.uuid4(),
            beta_expires_at=datetime.now(timezone.utc) + timedelta(days=90),
            referral_code="PROP1234",
            referrals_count=5,
        )
        assert beta_user.referrals_count == 5


class TestAPIEndpoints:
    """Test API endpoints."""

    def test_beta_status_endpoint(self):
        response = client.get("/api/v1/beta/status")
        assert response.status_code == 200
        data = response.json()
        assert "is_active" in data
        assert "max_users" in data
        assert "remaining_slots" in data

    def test_beta_waitlist_endpoint(self):
        response = client.post("/api/v1/beta/waitlist?email=test@example.com")
        assert response.status_code in [200, 201]

    def test_conversion_formats_endpoint(self):
        response = client.get("/api/v1/convert/formats")
        assert response.status_code == 200
        data = response.json()
        assert "input_formats" in data
        assert "output_formats" in data

    def test_ocr_languages_endpoint(self):
        response = client.get("/api/v1/ocr/languages")
        assert response.status_code == 200
        data = response.json()
        assert "languages" in data

    def test_ai_languages_endpoint(self):
        response = client.get("/api/v1/ai/languages")
        assert response.status_code == 200
        data = response.json()
        assert "languages" in data

    def test_unauthorized_access(self):
        response = client.get("/api/v1/documents/")
        assert response.status_code == 401

    def test_oauth_google_login(self):
        response = client.get("/api/v1/auth/google/login", follow_redirects=False)
        # Should redirect to Google
        assert response.status_code in [302, 307, 200]

    def test_oauth_github_login(self):
        response = client.get("/api/v1/auth/github/login", follow_redirects=False)
        # Should redirect to GitHub
        assert response.status_code in [302, 307, 200]


class TestSecurity:
    """Test security features."""

    def test_password_hashing(self):
        password = "testpassword123"
        hashed = hash_password(password)
        assert hashed != password
        assert len(hashed) > 0

    def test_token_creation(self):
        token = create_access_token({"sub": "test-user-id"})
        assert token is not None
        assert len(token) > 0

    def test_cors_headers(self):
        response = client.options("/health")
        assert response.status_code == 200


class TestDocumentUpload:
    """Test document upload functionality."""

    def test_upload_without_auth(self):
        response = client.post("/api/v1/documents/upload")
        assert response.status_code == 401

    def test_process_without_auth(self):
        response = client.post("/api/v1/process/", json={
            "task_type": "merge",
            "input_document_ids": []
        })
        assert response.status_code == 401


class TestFlutterApp:
    """Test Flutter app structure."""

    def test_main_dart_exists(self):
        assert os.path.exists("../frontend/lib/main.dart")

    def test_pubspec_yaml_exists(self):
        assert os.path.exists("../frontend/pubspec.yaml")

    def test_localization_exists(self):
        assert os.path.exists("../frontend/lib/core/localization/app_localizations.dart")

    def test_accessibility_provider_exists(self):
        assert os.path.exists("../frontend/lib/core/accessibility/accessibility_provider.dart")

    def test_voice_service_exists(self):
        assert os.path.exists("../frontend/lib/core/accessibility/voice_service.dart")

    def test_scanner_screen_exists(self):
        assert os.path.exists("../frontend/lib/presentation/screens/scan/document_scanner_screen.dart")

    def test_beta_screen_exists(self):
        assert os.path.exists("../frontend/lib/presentation/screens/beta_program_screen.dart")

    def test_ai_chat_screen_exists(self):
        assert os.path.exists("../frontend/lib/presentation/screens/ai_chat_screen.dart")

    def test_accessibility_screen_exists(self):
        assert os.path.exists("../frontend/lib/presentation/screens/accessibility_screen.dart")

    def test_language_screen_exists(self):
        assert os.path.exists("../frontend/lib/presentation/screens/language_screen.dart")

    def test_router_exists(self):
        assert os.path.exists("../frontend/lib/router/app_router.dart")

    def test_screens_count(self):
        screens_dir = "../frontend/lib/presentation/screens"
        if os.path.exists(screens_dir):
            files = [f for f in os.listdir(screens_dir) if f.endswith('.dart')]
            assert len(files) >= 10

    def test_supported_languages_count(self):
        from frontend.lib.core.localization.app_localizations import AppLocalizations
        assert len(AppLocalizations.supportedLocales) >= 35


class TestDockerConfiguration:
    """Test Docker and deployment configuration."""

    def test_dockerfile_exists(self):
        assert os.path.exists("../backend/Dockerfile")

    def test_docker_compose_exists(self):
        assert os.path.exists("../docker-compose.yml")

    def test_dockerfile_has_libreoffice(self):
        with open("../backend/Dockerfile", "r") as f:
            content = f.read()
            assert "libreoffice" in content.lower()

    def test_dockerfile_has_tesseract(self):
        with open("../backend/Dockerfile", "r") as f:
            content = f.read()
            assert "tesseract-ocr" in content

    def test_dockerfile_has_ghostscript(self):
        with open("../backend/Dockerfile", "r") as f:
            content = f.read()
            assert "ghostscript" in content.lower()

    def test_dockerfile_has_imagemagick(self):
        with open("../backend/Dockerfile", "r") as f:
            content = f.read()
            assert "imagemagick" in content.lower()


class TestRequirements:
    """Test Python dependencies."""

    def test_fastapi_in_requirements(self):
        with open("../backend/requirements.txt", "r") as f:
            content = f.read()
            assert "fastapi" in content

    def test_pymupdf_in_requirements(self):
        with open("../backend/requirements.txt", "r") as f:
            content = f.read()
            assert "pymupdf" in content

    def test_pytesseract_in_requirements(self):
        with open("../backend/requirements.txt", "r") as f:
            content = f.read()
            assert "pytesseract" in content

    def test_google_generativeai_in_requirements(self):
        with open("../backend/requirements.txt", "r") as f:
            content = f.read()
            assert "google-generativeai" in content

    def test_authlib_in_requirements(self):
        with open("../backend/requirements.txt", "r") as f:
            content = f.read()
            assert "authlib" in content


class TestProjectStructure:
    """Test overall project structure."""

    def test_backend_app_structure(self):
        assert os.path.exists("../backend/app")
        assert os.path.exists("../backend/app/api")
        assert os.path.exists("../backend/app/core")
        assert os.path.exists("../backend/app/models")
        assert os.path.exists("../backend/app/services")
        assert os.path.exists("../backend/app/db")

    def test_api_routers_exist(self):
        assert os.path.exists("../backend/app/api/auth.py")
        assert os.path.exists("../backend/app/api/oauth.py")
        assert os.path.exists("../backend/app/api/documents.py")
        assert os.path.exists("../backend/app/api/process.py")
        assert os.path.exists("../backend/app/api/conversion.py")
        assert os.path.exists("../backend/app/api/ocr.py")
        assert os.path.exists("../backend/app/api/ai.py")
        assert os.path.exists("../backend/app/api/beta.py")

    def test_services_exist(self):
        assert os.path.exists("../backend/app/services/pdf_service.py")
        assert os.path.exists("../backend/app/services/conversion_service.py")
        assert os.path.exists("../backend/app/services/ocr_service.py")
        assert os.path.exists("../backend/app/services/ai_service.py")
        assert os.path.exists("../backend/app/services/storage_service.py")
        assert os.path.exists("../backend/app/services/celery_tasks.py")

    def test_cicd_exists(self):
        assert os.path.exists("../.github/workflows/ci-cd.yml")

    def test_readme_exists(self):
        assert os.path.exists("../README.md")

    def test_roadmap_exists(self):
        assert os.path.exists("../ROADMAP.md")

    def test_env_example_exists(self):
        assert os.path.exists("../backend/.env.example")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
