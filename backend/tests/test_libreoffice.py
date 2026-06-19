import pytest
import os
import tempfile
import shutil
from unittest.mock import Mock, patch, MagicMock
from pathlib import Path

from app.services.conversion_service import ConversionService, ConversionError


class TestLibreOfficeIntegration:
    """Comprehensive tests for LibreOffice headless integration."""

    def test_find_libreoffice_returns_path(self):
        """Test that LibreOffice binary detection works."""
        service = ConversionService()
        path = service.libreoffice_path
        assert path is not None
        assert len(path) > 0
        # Should be either an absolute path or a command name
        assert path.endswith("soffice") or path.endswith("libreoffice")

    def test_find_libreoffice_with_shutil_which(self):
        """Test that _find_libreoffice uses shutil.which correctly."""
        with patch("shutil.which") as mock_which:
            mock_which.return_value = "/usr/bin/soffice"
            service = ConversionService()
            assert service.libreoffice_path == "/usr/bin/soffice"

    def test_find_libreoffice_fallback(self):
        """Test fallback when LibreOffice is not found."""
        with patch("shutil.which") as mock_which:
            mock_which.return_value = None
            with patch("os.path.exists") as mock_exists:
                mock_exists.return_value = False
                service = ConversionService()
                assert service.libreoffice_path == "soffice"

    def test_headless_flags_present(self):
        """Verify all headless stability flags are present in the conversion."""
        service = ConversionService()
        
        with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as f:
            f.write(b"test")
            temp_path = f.name
        
        try:
            with patch("subprocess.run") as mock_run:
                mock_result = Mock()
                mock_result.returncode = 0
                mock_result.stdout = ""
                mock_result.stderr = ""
                mock_run.return_value = mock_result
                
                # Mock os.path.exists for output file
                with patch("os.path.exists") as mock_exists:
                    mock_exists.return_value = True
                    with patch("os.listdir") as mock_listdir:
                        mock_listdir.return_value = ["test.pdf"]
                        with patch("shutil.move") as mock_move:
                            mock_move.return_value = None
                            
                            try:
                                service.convert_with_libreoffice(temp_path, "pdf")
                            except:
                                pass
                            
                            # Check the command that was called
                            call_args = mock_run.call_args
                            cmd = call_args[0][0]
                            
                            assert "--headless" in cmd
                            assert "--nologo" in cmd
                            assert "--nolockcheck" in cmd
                            assert "--nofirststartwizard" in cmd
                            assert "--norestore" in cmd
                            assert "--convert-to" in cmd
                            assert "--outdir" in cmd
                            assert "pdf" in cmd
                            assert temp_path in cmd
        finally:
            os.unlink(temp_path)

    def test_conversion_timeout_handling(self):
        """Test that timeout is handled gracefully."""
        service = ConversionService()
        
        with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as f:
            f.write(b"test")
            temp_path = f.name
        
        try:
            with patch("subprocess.run") as mock_run:
                import subprocess
                mock_run.side_effect = subprocess.TimeoutExpired(cmd="soffice", timeout=300)
                
                with pytest.raises(ConversionError) as exc_info:
                    service.convert_with_libreoffice(temp_path, "pdf")
                
                assert "timed out" in str(exc_info.value).lower()
                assert "300" in str(exc_info.value)
        finally:
            os.unlink(temp_path)

    def test_conversion_failure_handling(self):
        """Test that LibreOffice errors are captured properly."""
        service = ConversionService()
        
        with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as f:
            f.write(b"test")
            temp_path = f.name
        
        try:
            with patch("subprocess.run") as mock_run:
                mock_result = Mock()
                mock_result.returncode = 1
                mock_result.stderr = "Error: file format not supported"
                mock_result.stdout = ""
                mock_run.return_value = mock_result
                
                with pytest.raises(ConversionError) as exc_info:
                    service.convert_with_libreoffice(temp_path, "pdf")
                
                assert "failed" in str(exc_info.value).lower()
                assert "exit code 1" in str(exc_info.value)
        finally:
            os.unlink(temp_path)

    def test_temp_directory_cleanup(self):
        """Test that temporary directories are cleaned up after conversion."""
        service = ConversionService()
        
        with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as f:
            f.write(b"test")
            temp_path = f.name
        
        created_dirs = []
        
        def capture_mkdtemp(*args, **kwargs):
            d = tempfile.mkdtemp(*args, **kwargs)
            created_dirs.append(d)
            return d
        
        try:
            with patch("tempfile.mkdtemp", side_effect=capture_mkdtemp):
                with patch("subprocess.run") as mock_run:
                    mock_result = Mock()
                    mock_result.returncode = 0
                    mock_result.stdout = ""
                    mock_result.stderr = ""
                    mock_run.return_value = mock_result
                    
                    with patch("os.path.exists") as mock_exists:
                        mock_exists.return_value = True
                        with patch("os.listdir") as mock_listdir:
                            mock_listdir.return_value = ["test.pdf"]
                            with patch("shutil.move") as mock_move:
                                mock_move.return_value = None
                                
                                try:
                                    service.convert_with_libreoffice(temp_path, "pdf")
                                except:
                                    pass
            
            # All created temp dirs should be cleaned up
            for d in created_dirs:
                assert not os.path.exists(d), f"Temp directory {d} was not cleaned up"
        finally:
            os.unlink(temp_path)

    def test_shutil_move_used_for_cross_device(self):
        """Test that shutil.move is used instead of os.rename for cross-device safety."""
        service = ConversionService()
        
        with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as f:
            f.write(b"test")
            temp_path = f.name
        
        try:
            with patch("subprocess.run") as mock_run:
                mock_result = Mock()
                mock_result.returncode = 0
                mock_result.stdout = ""
                mock_result.stderr = ""
                mock_run.return_value = mock_result
                
                with patch("os.path.exists") as mock_exists:
                    mock_exists.return_value = True
                    with patch("os.listdir") as mock_listdir:
                        mock_listdir.return_value = ["test.pdf"]
                        with patch("shutil.move") as mock_move:
                            mock_move.return_value = None
                            
                            try:
                                service.convert_with_libreoffice(temp_path, "pdf")
                            except:
                                pass
                            
                            # Verify shutil.move was called
                            mock_move.assert_called_once()
        finally:
            os.unlink(temp_path)

    def test_input_file_not_found(self):
        """Test that missing input files raise ConversionError."""
        service = ConversionService()
        
        with pytest.raises(ConversionError) as exc_info:
            service.convert_with_libreoffice("/nonexistent/file.docx", "pdf")
        
        assert "not found" in str(exc_info.value).lower()

    def test_no_conversion_needed_same_format(self):
        """Test that same-format inputs are returned without conversion."""
        service = ConversionService()
        
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(b"test pdf content")
            temp_path = f.name
        
        try:
            result = service.convert_document(temp_path, "pdf")
            assert result == temp_path  # Should return same path
        finally:
            os.unlink(temp_path)

    def test_unsupported_output_format(self):
        """Test that unsupported formats raise ConversionError."""
        service = ConversionService()
        
        with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as f:
            f.write(b"test")
            temp_path = f.name
        
        try:
            with pytest.raises(ConversionError) as exc_info:
                service.convert_document(temp_path, "unsupported_format")
            
            assert "unsupported" in str(exc_info.value).lower()
        finally:
            os.unlink(temp_path)

    def test_dockerfile_has_libreoffice_packages(self):
        """Verify Dockerfile installs LibreOffice components."""
        dockerfile_path = os.path.join(os.path.dirname(__file__), "../../Dockerfile")
        if os.path.exists(dockerfile_path):
            with open(dockerfile_path) as f:
                content = f.read()
            assert "libreoffice-writer" in content, "libreoffice-writer not in Dockerfile"
            assert "libreoffice-calc" in content, "libreoffice-calc not in Dockerfile"
            assert "libreoffice-impress" in content, "libreoffice-impress not in Dockerfile"
            assert "--headless" in content or "headless" in content.lower(), "headless not mentioned"

    def test_supported_formats_comprehensive(self):
        """Test that all expected formats are supported."""
        service = ConversionService()
        
        expected_formats = [
            "doc", "docx", "odt", "rtf", "txt", "html", "md",
            "xls", "xlsx", "ods", "csv",
            "ppt", "pptx", "odp",
            "epub", "mobi",
            "pdf", "jpg", "jpeg", "png", "webp", "svg", "tiff", "bmp", "gif", "heic",
        ]
        
        for fmt in expected_formats:
            assert fmt in service.SUPPORTED_FORMATS, f"Format {fmt} not in SUPPORTED_FORMATS"

    def test_mime_types_mapping(self):
        """Test that MIME types are correctly mapped."""
        service = ConversionService()
        
        assert service.MIME_TYPES["pdf"] == "application/pdf"
        assert service.MIME_TYPES["docx"] == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        assert service.MIME_TYPES["xlsx"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        assert service.MIME_TYPES["pptx"] == "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        assert service.MIME_TYPES["jpg"] == "image/jpeg"
        assert service.MIME_TYPES["png"] == "image/png"

    def test_conversion_service_logs_initialization(self):
        """Test that service logs LibreOffice path on init."""
        with patch("app.services.conversion_service.logger") as mock_logger:
            service = ConversionService()
            mock_logger.info.assert_called_with("libreoffice_initialized", path=service.libreoffice_path)
