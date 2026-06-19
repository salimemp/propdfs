#!/usr/bin/env python3
"""
LibreOffice Conversion Verification Script
Run inside the ProPDFs Docker container:
    docker compose exec api python3 /app/test_conversion.py
"""

import os
import sys
import tempfile
import time
from pathlib import Path

# Add app to path
sys.path.insert(0, "/app")

from app.services.conversion_service import ConversionService, ConversionError

def create_test_documents():
    """Create test documents for conversion."""
    test_dir = tempfile.mkdtemp(prefix="propdfs_test_")
    
    # Create a simple HTML document
    html_path = os.path.join(test_dir, "test.html")
    with open(html_path, "w") as f:
        f.write("""<!DOCTYPE html>
<html>
<head><title>ProPDFs Test</title></head>
<body>
<h1>Conversion Test</h1>
<p>This tests LibreOffice headless conversion.</p>
<ul>
<li>PDF processing</li>
<li>Document conversion</li>
<li>30+ formats</li>
</ul>
</body>
</html>""")
    
    # Create a simple text document
    txt_path = os.path.join(test_dir, "test.txt")
    with open(txt_path, "w") as f:
        f.write("ProPDFs Conversion Test\n========================\n\n")
        f.write("Testing LibreOffice headless conversion.\n")
        f.write("Formats: PDF, DOCX, XLSX, PPTX, HTML, TXT, EPUB\n")
    
    return test_dir, html_path, txt_path

def run_tests():
    """Run conversion tests."""
    print("=" * 60)
    print("ProPDFs LibreOffice Conversion Verification")
    print("=" * 60)
    print()
    
    # Initialize service
    print("1. Initializing ConversionService...")
    service = ConversionService()
    print(f"   ✅ LibreOffice path: {service.libreoffice_path}")
    print()
    
    # Create test documents
    print("2. Creating test documents...")
    test_dir, html_path, txt_path = create_test_documents()
    print(f"   ✅ Test dir: {test_dir}")
    print()
    
    results = []
    
    # Test 1: HTML to PDF
    print("3. Test 1: HTML → PDF")
    try:
        start = time.time()
        output = service.convert_with_libreoffice(html_path, "pdf")
        elapsed = time.time() - start
        size = os.path.getsize(output)
        print(f"   ✅ Success: {size} bytes in {elapsed:.2f}s")
        print(f"   📄 Output: {output}")
        results.append(("HTML → PDF", True, elapsed, size))
    except Exception as e:
        print(f"   ❌ Failed: {e}")
        results.append(("HTML → PDF", False, 0, 0))
    print()
    
    # Test 2: TXT to PDF
    print("4. Test 2: TXT → PDF")
    try:
        start = time.time()
        output = service.convert_with_libreoffice(txt_path, "pdf")
        elapsed = time.time() - start
        size = os.path.getsize(output)
        print(f"   ✅ Success: {size} bytes in {elapsed:.2f}s")
        results.append(("TXT → PDF", True, elapsed, size))
    except Exception as e:
        print(f"   ❌ Failed: {e}")
        results.append(("TXT → PDF", False, 0, 0))
    print()
    
    # Test 3: HTML to DOCX
    print("5. Test 3: HTML → DOCX")
    try:
        start = time.time()
        output = service.convert_with_libreoffice(html_path, "docx")
        elapsed = time.time() - start
        size = os.path.getsize(output)
        print(f"   ✅ Success: {size} bytes in {elapsed:.2f}s")
        results.append(("HTML → DOCX", True, elapsed, size))
    except Exception as e:
        print(f"   ❌ Failed: {e}")
        results.append(("HTML → DOCX", False, 0, 0))
    print()
    
    # Test 4: HTML to ODT
    print("6. Test 4: HTML → ODT")
    try:
        start = time.time()
        output = service.convert_with_libreoffice(html_path, "odt")
        elapsed = time.time() - start
        size = os.path.getsize(output)
        print(f"   ✅ Success: {size} bytes in {elapsed:.2f}s")
        results.append(("HTML → ODT", True, elapsed, size))
    except Exception as e:
        print(f"   ❌ Failed: {e}")
        results.append(("HTML → ODT", False, 0, 0))
    print()
    
    # Test 5: Full pipeline (HTML → PDF → TXT)
    print("7. Test 5: Full pipeline (HTML → PDF → TXT)")
    try:
        start = time.time()
        pdf_output = service.convert_document(html_path, "pdf")
        txt_output = service.convert_document(pdf_output, "txt")
        elapsed = time.time() - start
        size = os.path.getsize(txt_output)
        print(f"   ✅ Success: {size} bytes in {elapsed:.2f}s")
        results.append(("HTML → PDF → TXT", True, elapsed, size))
    except Exception as e:
        print(f"   ❌ Failed: {e}")
        results.append(("HTML → PDF → TXT", False, 0, 0))
    print()
    
    # Test 6: PDF info extraction
    print("8. Test 6: PDF metadata extraction")
    try:
        pdf_output = service.convert_with_libreoffice(html_path, "pdf")
        info = service.get_document_info(pdf_output)
        print(f"   ✅ Format: {info['format']}")
        print(f"   ✅ Size: {info['file_size']} bytes")
        print(f"   ✅ Pages: {info.get('page_count', 'N/A')}")
        results.append(("PDF Info", True, 0, 0))
    except Exception as e:
        print(f"   ❌ Failed: {e}")
        results.append(("PDF Info", False, 0, 0))
    print()
    
    # Summary
    print("=" * 60)
    print("Test Summary")
    print("=" * 60)
    passed = sum(1 for r in results if r[1])
    total = len(results)
    print(f"   Passed: {passed}/{total}")
    print()
    
    for name, status, elapsed, size in results:
        icon = "✅" if status else "❌"
        size_str = f"{size} bytes" if size > 0 else ""
        time_str = f"{elapsed:.2f}s" if elapsed > 0 else ""
        print(f"   {icon} {name:<20} {time_str:<10} {size_str}")
    print()
    
    if passed == total:
        print("🎉 All tests passed! LibreOffice is working perfectly.")
    else:
        print(f"⚠️  {total - passed} test(s) failed. Check output above.")
    print()
    
    # Cleanup
    import shutil
    if os.path.exists(test_dir):
        shutil.rmtree(test_dir, ignore_errors=True)
    print(f"🧹 Cleaned up test directory: {test_dir}")
    print()
    
    return passed == total

if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
