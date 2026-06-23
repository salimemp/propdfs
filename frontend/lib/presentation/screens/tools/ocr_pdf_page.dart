import 'dart:async';
import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:pdfx/pdfx.dart';

import '../../../core/services/pdf_editor_service.dart';
import '../../../core/services/web_bridge.dart';
import '../../../core/theme.dart';

/// OCR PDF — turn a scanned, image-only PDF into a searchable one.
///
/// Pipeline (web-only, runs entirely in the browser):
///   1. Open the PDF with pdfx → get a [PdfDocument]
///   2. For each page, render to PNG via [PdfPageImage]
///   3. Hand the PNG data URL to Tesseract.js via [WebBridge.ocrImage]
///   4. Get back the recognised text + per-word bounding boxes
///   5. Overlay an invisible text layer via
///      [PdfEditorService.overlayOcrText] so the result is searchable
///   6. Download the new PDF via [WebBridge.downloadBytes]
///
/// On native (mobile) we fall back to a clearly-labelled "not yet
/// supported" path — the OCR engine + page renderer need a Flutter
/// native binding which we'll add in a follow-up. The web path is
/// fully functional.
class OcrPdfPage extends StatefulWidget {
  const OcrPdfPage({super.key});

  @override
  State<OcrPdfPage> createState() => _OcrPdfPageState();
}

class _OcrPdfPageState extends State<OcrPdfPage> {
  Uint8List? _inputBytes;
  String? _inputName;
  bool _busy = false;
  String? _statusMessage;
  String? _error;
  String? _detectedText;
  int _detectedBlockCount = 0;
  Uint8List? _outputBytes;
  String _language = 'eng';

  static const _languageOptions = <String, String>{
    'eng': 'English',
    'spa': 'Spanish',
    'fra': 'French',
    'deu': 'German',
    'hin': 'Hindi',
    'ara': 'Arabic',
    'chi_sim': 'Chinese (Simplified)',
    'jpn': 'Japanese',
    'kor': 'Korean',
    'por': 'Portuguese',
    'rus': 'Russian',
  };

  @override
  void dispose() {
    // Free the Tesseract worker on screen exit.
    if (kIsWeb) WebBridge.terminateOcr();
    super.dispose();
  }

  Future<void> _pickFile() async {
    setState(() {
      _error = null;
      _detectedText = null;
      _outputBytes = null;
      _statusMessage = null;
    });
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['pdf'],
      withData: true,
    );
    if (result == null || result.files.isEmpty) return;
    final f = result.files.first;
    if (f.bytes == null) return;
    setState(() {
      _inputBytes = f.bytes;
      _inputName = f.name;
    });
  }

  Future<void> _runOcr() async {
    if (_inputBytes == null) return;
    if (!kIsWeb) {
      setState(() => _error =
          'OCR currently runs in the browser. Open the web app at '
          'https://app.getpdfpro.com/tools/ocr to use OCR.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _detectedText = null;
      _detectedBlockCount = 0;
      _outputBytes = null;
      _statusMessage = 'Opening PDF…';
    });

    try {
      final doc = await PdfDocument.openData(_inputBytes!);
      final pageCount = doc.pagesCount;

      Uint8List currentBytes = _inputBytes!;
      final allText = StringBuffer();

      for (var i = 0; i < pageCount; i++) {
        if (!mounted) return;
        setState(() => _statusMessage =
            'Rendering page ${i + 1} of $pageCount…');

        final page = await doc.getPage(i + 1); // pdfx is 1-indexed
        final image = await page.render(
          width: page.width * 2, // 2x for better OCR accuracy
          height: page.height * 2,
          format: PdfPageImageFormat.png,
          // pdfx closes the page automatically after rendering.
        );
        await page.close();

        if (image == null) {
          throw StateError('Could not render page ${i + 1} to image.');
        }

        setState(() => _statusMessage =
            'Recognising text on page ${i + 1} of $pageCount…');

        final dataUrl =
            'data:image/png;base64,${base64Encode(image.bytes)}';
        final result = await WebBridge.ocrImage(dataUrl, lang: _language);

        if (result.text.isNotEmpty) {
          allText.writeln('--- Page ${i + 1} ---');
          allText.writeln(result.text.trim());
          allText.writeln();
        }
        _detectedBlockCount += result.blocks.length;

        // Overlay the invisible text layer on this page. We accumulate
        // a single output PDF by re-encoding after each overlay.
        if (result.blocks.isNotEmpty) {
          final blocks = result.blocks
              .map((b) => OcrTextBlock(
                    text: b.text,
                    box: Rect.fromLTWH(b.x, b.y, b.w, b.h),
                  ))
              .toList();
          // We scale image coords to PDF coords. The render is 2x the
          // page dimensions, so divide by 2.
          final scaled = blocks
              .map((b) => OcrTextBlock(
                    text: b.text,
                    box: Rect.fromLTWH(
                      b.box.left / 2,
                      b.box.top / 2,
                      b.box.width / 2,
                      b.box.height / 2,
                    ),
                  ))
              .toList();
          currentBytes = await PdfEditorService.overlayOcrText(
            pdfBytes: currentBytes,
            pageIndex: i,
            blocks: scaled,
          );
        }
      }

      await doc.close();

      if (!mounted) return;
      setState(() {
        _detectedText = allText.toString().trim();
        _outputBytes = currentBytes;
        _busy = false;
        _statusMessage = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'OCR failed: $e';
        _busy = false;
        _statusMessage = null;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surfaceLight,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: AppColors.catOptimize.withOpacity(0.12),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.document_scanner,
                  size: 18, color: AppColors.catOptimize),
            ),
            const SizedBox(width: 10),
            const Text('OCR PDF'),
          ],
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 720),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _buildHeader(),
                const SizedBox(height: 24),
                _buildLanguagePicker(),
                const SizedBox(height: 16),
                _buildPickArea(),
                const SizedBox(height: 16),
                if (_error != null) _buildErrorBanner(_error!),
                if (_statusMessage != null) _buildStatusBanner(_statusMessage!),
                if (_detectedText != null) _buildDetectedPanel(_detectedText!),
                if (_outputBytes != null) _buildResultBanner(),
                const SizedBox(height: 16),
                _buildActions(),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() => Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              AppColors.catOptimize.withOpacity(0.10),
              AppColors.surfaceLight,
            ],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.catOptimize.withOpacity(0.30)),
        ),
        child: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.lock_outline, size: 18, color: AppColors.catOptimize),
                SizedBox(width: 8),
                Text(
                  '100% private — runs locally with Tesseract.js',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.catOptimize,
                  ),
                ),
              ],
            ),
            SizedBox(height: 12),
            Text(
              'OCR PDF runs text recognition on every page of a scanned PDF '
              'and produces a new file with an invisible text layer — making '
              'the document searchable, copy-pasteable, and accessible to '
              'screen readers. The first run downloads the OCR engine '
              '(~10 MB); subsequent runs are cached.',
              style: TextStyle(
                fontSize: 14,
                color: AppColors.textMutedLight,
                height: 1.6,
              ),
            ),
          ],
        ),
      );

  Widget _buildLanguagePicker() => Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: AppColors.surfaceMutedLight,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.borderLight),
        ),
        child: Row(
          children: [
            const Icon(Icons.translate, size: 18, color: AppColors.textLight),
            const SizedBox(width: 12),
            const Text('Recognition language:',
                style: TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(width: 12),
            Expanded(
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  isExpanded: true,
                  value: _language,
                  items: _languageOptions.entries
                      .map((e) => DropdownMenuItem(
                            value: e.key,
                            child: Text(e.value),
                          ))
                      .toList(),
                  onChanged: _busy
                      ? null
                      : (v) {
                          if (v != null) setState(() => _language = v);
                        },
                ),
              ),
            ),
          ],
        ),
      );

  Widget _buildPickArea() {
    final hasFile = _inputBytes != null;
    return InkWell(
      onTap: _busy ? null : _pickFile,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(32),
        decoration: BoxDecoration(
          border: Border.all(
            color: hasFile ? AppColors.catOptimize : Colors.grey[400]!,
            width: hasFile ? 2 : 1.5,
          ),
          borderRadius: BorderRadius.circular(16),
          color: hasFile
              ? AppColors.catOptimize.withOpacity(0.04)
              : Colors.grey[50],
        ),
        child: Column(
          children: [
            Icon(
              hasFile ? Icons.check_circle : Icons.upload_file_outlined,
              size: 48,
              color: hasFile ? AppColors.catOptimize : Colors.grey[600],
            ),
            const SizedBox(height: 12),
            Text(
              hasFile ? _inputName! : 'Tap to choose a scanned PDF',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: hasFile
                    ? AppColors.textLight
                    : AppColors.textMutedLight,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 4),
            Text(
              'Best on scanned documents with clear text. Up to 500 MB.',
              style: TextStyle(fontSize: 13, color: Colors.grey[600]),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildErrorBanner(String msg) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.danger.withOpacity(0.08),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.danger.withOpacity(0.30)),
        ),
        child: Row(
          children: [
            const Icon(Icons.error_outline, color: AppColors.danger),
            const SizedBox(width: 12),
            Expanded(child: Text(msg)),
          ],
        ),
      );

  Widget _buildStatusBanner(String msg) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.primary.withOpacity(0.06),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.primary.withOpacity(0.30)),
        ),
        child: Row(
          children: [
            const SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(
                  strokeWidth: 2, color: AppColors.primary),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                msg,
                style: const TextStyle(
                    fontSize: 14, color: AppColors.textLight),
              ),
            ),
          ],
        ),
      );

  Widget _buildDetectedPanel(String text) => Container(
        margin: const EdgeInsets.only(top: 16),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surfaceMutedLight,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.borderLight),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.text_fields,
                    size: 18, color: AppColors.primary),
                const SizedBox(width: 8),
                Text(
                  'Detected text — $_detectedBlockCount words',
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textLight,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              text.isEmpty ? '(no text detected)' : text,
              style: const TextStyle(
                fontSize: 13,
                color: AppColors.textMutedLight,
                height: 1.5,
              ),
            ),
          ],
        ),
      );

  Widget _buildResultBanner() => Container(
        margin: const EdgeInsets.only(top: 16),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.success.withOpacity(0.08),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.success.withOpacity(0.30)),
        ),
        child: const Row(
          children: [
            Icon(Icons.check_circle, color: AppColors.success),
            SizedBox(width: 12),
            Expanded(
              child: Text(
                'Searchable PDF ready. The original scan is preserved; an '
                'invisible text layer has been added so the document is '
                'searchable, copy-pasteable, and screen-reader-friendly.',
                style: TextStyle(
                    fontSize: 14, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      );

  Widget _buildActions() {
    final canRun = _inputBytes != null && !_busy;
    final canDownload = _outputBytes != null;
    return Wrap(
      spacing: 12,
      runSpacing: 12,
      alignment: WrapAlignment.center,
      children: [
        FilledButton.icon(
          onPressed: canRun ? _runOcr : null,
          icon: _busy
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: Colors.white))
              : const Icon(Icons.document_scanner),
          label: Text(_busy ? 'Recognising…' : 'Run OCR'),
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.catOptimize,
            foregroundColor: Colors.white,
            padding:
                const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          ),
        ),
        if (canDownload)
          OutlinedButton.icon(
            onPressed: () =>
                _webDownload(_outputBytes!, _suggestName(_inputName!)),
            icon: const Icon(Icons.download),
            label: const Text('Download searchable PDF'),
            style: OutlinedButton.styleFrom(
              padding:
                  const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
            ),
          ),
      ],
    );
  }
}

String _suggestName(String original) {
  final dot = original.lastIndexOf('.');
  if (dot < 0) return '$original-ocr.pdf';
  return '${original.substring(0, dot)}-ocr.pdf';
}

void _webDownload(Uint8List bytes, String filename) {
  WebBridge.downloadBytes(bytes, filename, mimeType: 'application/pdf');
}
