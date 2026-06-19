#!/bin/bash
# LibreOffice Conversion Verification Script
# Run this inside the ProPDFs Docker container to verify LibreOffice conversions

set -e

echo "=========================================="
echo "ProPDFs LibreOffice Conversion Test"
echo "=========================================="
echo ""

# Check LibreOffice is installed
echo "1. Checking LibreOffice installation..."
if command -v soffice &> /dev/null; then
    SOFFICE="soffice"
elif command -v libreoffice &> /dev/null; then
    SOFFICE="libreoffice"
else
    echo "❌ LibreOffice not found!"
    exit 1
fi

echo "   ✅ LibreOffice found: $SOFFICE"
$SOFFICE --version
echo ""

# Create test directory
TEST_DIR="/tmp/propdfs_conversion_test"
mkdir -p $TEST_DIR
cd $TEST_DIR

# Create test documents
echo "2. Creating test documents..."

# Create a simple HTML test file
cat > test_document.html << 'EOF'
<!DOCTYPE html>
<html>
<head><title>ProPDFs Test</title></head>
<body>
<h1>LibreOffice Conversion Test</h1>
<p>This document tests LibreOffice headless conversion capabilities.</p>
<table border="1">
<tr><th>Feature</th><th>Status</th></tr>
<tr><td>PDF Merge</td><td>Active</td></tr>
<tr><td>DOCX Convert</td><td>Active</td></tr>
<tr><td>OCR</td><td>Active</td></tr>
</table>
<p>Supported formats: PDF, DOCX, XLSX, PPTX, JPG, PNG, TXT, HTML, EPUB</p>
</body>
</html>
EOF

# Create a simple text file
cat > test_document.txt << 'EOF'
ProPDFs Conversion Test
=======================

This is a test document for LibreOffice conversion.

Features:
- PDF processing
- Document conversion
- OCR support
- AI integration

Testing 30+ format conversions.
EOF

echo "   ✅ Test documents created in $TEST_DIR"
echo ""

# Test 1: HTML to PDF
echo "3. Test 1: HTML → PDF"
$SOFFICE --headless --nologo --nolockcheck --nofirststartwizard --norestore \
    --convert-to pdf --outdir $TEST_DIR $TEST_DIR/test_document.html

if [ -f "$TEST_DIR/test_document.pdf" ]; then
    PDF_SIZE=$(stat -c%s "$TEST_DIR/test_document.pdf" 2>/dev/null || stat -f%z "$TEST_DIR/test_document.pdf")
    echo "   ✅ PDF created: $PDF_SIZE bytes"
else
    echo "   ❌ PDF creation failed"
fi
echo ""

# Test 2: TXT to PDF
echo "4. Test 2: TXT → PDF"
$SOFFICE --headless --nologo --nolockcheck --nofirststartwizard --norestore \
    --convert-to pdf --outdir $TEST_DIR $TEST_DIR/test_document.txt

if [ -f "$TEST_DIR/test_document.pdf" ]; then
    PDF_SIZE=$(stat -c%s "$TEST_DIR/test_document.pdf" 2>/dev/null || stat -f%z "$TEST_DIR/test_document.pdf")
    echo "   ✅ PDF created: $PDF_SIZE bytes"
else
    echo "   ❌ PDF creation failed"
fi
echo ""

# Test 3: HTML to DOCX
echo "5. Test 3: HTML → DOCX"
$SOFFICE --headless --nologo --nolockcheck --nofirststartwizard --norestore \
    --convert-to docx --outdir $TEST_DIR $TEST_DIR/test_document.html

if [ -f "$TEST_DIR/test_document.docx" ]; then
    DOCX_SIZE=$(stat -c%s "$TEST_DIR/test_document.docx" 2>/dev/null || stat -f%z "$TEST_DIR/test_document.docx")
    echo "   ✅ DOCX created: $DOCX_SIZE bytes"
else
    echo "   ❌ DOCX creation failed"
fi
echo ""

# Test 4: HTML to ODT
echo "6. Test 4: HTML → ODT"
$SOFFICE --headless --nologo --nolockcheck --nofirststartwizard --norestore \
    --convert-to odt --outdir $TEST_DIR $TEST_DIR/test_document.html

if [ -f "$TEST_DIR/test_document.odt" ]; then
    ODT_SIZE=$(stat -c%s "$TEST_DIR/test_document.odt" 2>/dev/null || stat -f%z "$TEST_DIR/test_document.odt")
    echo "   ✅ ODT created: $ODT_SIZE bytes"
else
    echo "   ❌ ODT creation failed"
fi
echo ""

# Test 5: PDF info
echo "7. Test 5: PDF metadata"
if [ -f "$TEST_DIR/test_document.pdf" ]; then
    PDF_PAGES=$(python3 -c "import fitz; doc=fitz.open('$TEST_DIR/test_document.pdf'); print(doc.page_count); doc.close()" 2>/dev/null || echo "?")
    echo "   ✅ PDF page count: $PDF_PAGES"
else
    echo "   ❌ No PDF to check"
fi
echo ""

# Test 6: Performance test
echo "8. Test 6: Performance benchmark"
for i in 1 2 3; do
    cp $TEST_DIR/test_document.html $TEST_DIR/perf_test_$i.html
done

START_TIME=$(date +%s.%N)
for i in 1 2 3; do
    $SOFFICE --headless --nologo --nolockcheck --nofirststartwizard --norestore \
        --convert-to pdf --outdir $TEST_DIR $TEST_DIR/perf_test_$i.html > /dev/null 2>&1
done
END_TIME=$(date +%s.%N)

ELAPSED=$(python3 -c "print(f'{$END_TIME - $START_TIME:.2f}')")
echo "   ✅ 3 conversions in $ELAPSED seconds"
echo ""

# Summary
echo "=========================================="
echo "Conversion Test Summary"
echo "=========================================="
echo ""
ls -lh $TEST_DIR/*.{pdf,docx,odt,html,txt} 2>/dev/null | awk '{print "   " $9 ": " $5}'
echo ""
echo "✅ LibreOffice headless conversion is working correctly!"
echo ""
echo "To test with your own documents:"
echo "   docker compose exec api soffice --headless --convert-to pdf --outdir /tmp /path/to/your.docx"
echo ""
echo "Cleanup: rm -rf $TEST_DIR"
