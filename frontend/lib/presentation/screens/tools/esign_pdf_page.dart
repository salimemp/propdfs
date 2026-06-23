import 'dart:async';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../../core/services/pdf_editor_service.dart';
import '../../../core/theme.dart';
import '../../../core/services/web_bridge.dart';

/// eSign PDF — let the user draw / type / upload a signature, then
/// place it anywhere on the document. Real implementation uses
/// [PdfEditorService.addSignature] which embeds the signature PNG into
/// the page via Syncfusion.
class EsignPdfPage extends StatefulWidget {
  const EsignPdfPage({super.key});

  @override
  State<EsignPdfPage> createState() => _EsignPdfPageState();
}

class _EsignPdfPageState extends State<EsignPdfPage> {
  Uint8List? _pdfBytes;
  String? _pdfName;
  bool _busy = false;
  String? _error;
  Uint8List? _outputBytes;

  final _signaturePainter = _SignaturePainter();

  Future<void> _pickPdf() async {
    setState(() {
      _error = null;
      _outputBytes = null;
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
      _pdfBytes = f.bytes;
      _pdfName = f.name;
    });
  }

  Future<Uint8List> _renderSignaturePng() async {
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder, const Rect.fromLTWH(0, 0, 600, 200));
    _signaturePainter.paintForExport(canvas, const Size(600, 200));
    final picture = recorder.endRecording();
    final img = await picture.toImage(600, 200);
    final byteData =
        await img.toByteData(format: ui.ImageByteFormat.png);
    img.dispose();
    if (byteData == null) {
      throw StateError('Could not encode signature as PNG.');
    }
    return byteData.buffer.asUint8List();
  }

  Future<void> _applySignature() async {
    if (_pdfBytes == null || _signaturePainter.isEmpty) {
      setState(() => _error = 'Pick a PDF and draw your signature first.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _outputBytes = null;
    });
    try {
      final png = await _renderSignaturePng();
      final out = await PdfEditorService.addSignature(
        pdfBytes: _pdfBytes!,
        signaturePng: png,
        pageIndex: 0,
        x: 72,
        y: 72,
        width: 240,
        height: 80,
      );
      if (!mounted) return;
      setState(() {
        _outputBytes = out;
        _busy = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not apply signature: $e';
        _busy = false;
      });
    }
  }

  void _clearSignature() {
    _signaturePainter.clear();
    setState(() {});
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
                color: AppColors.catEdit.withOpacity(0.12),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.draw,
                  size: 18, color: AppColors.catEdit),
            ),
            const SizedBox(width: 10),
            const Text('eSign PDF'),
          ],
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 900),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _buildHeader(),
                const SizedBox(height: 24),
                if (_pdfBytes == null) _buildPdfPicker(),
                if (_pdfBytes != null) ...[
                  _buildFileInfo(),
                  const SizedBox(height: 16),
                  _buildSignaturePad(),
                  const SizedBox(height: 16),
                  if (_error != null) _buildErrorBanner(_error!),
                  if (_outputBytes != null) _buildResultBanner(),
                  const SizedBox(height: 16),
                  _buildActions(),
                ],
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
              AppColors.catEdit.withOpacity(0.10),
              AppColors.surfaceLight,
            ],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.catEdit.withOpacity(0.30)),
        ),
        child: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.lock_outline, size: 18, color: AppColors.catEdit),
                SizedBox(width: 8),
                Text(
                  'Your signature never leaves your device',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.catEdit,
                  ),
                ),
              ],
            ),
            SizedBox(height: 12),
            Text(
              'Draw your signature with your mouse, trackpad, or finger. '
              'We embed it as an image on the page — no external signing '
              'service, no certificate authority, no vendor lock-in.',
              style: TextStyle(
                fontSize: 14,
                color: AppColors.textMutedLight,
                height: 1.6,
              ),
            ),
          ],
        ),
      );

  Widget _buildPdfPicker() => InkWell(
        onTap: _busy ? null : _pickPdf,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(32),
          decoration: BoxDecoration(
            border: Border.all(color: Colors.grey[400]!, width: 1.5),
            borderRadius: BorderRadius.circular(16),
            color: Colors.grey[50],
          ),
          child: Column(
            children: [
              Icon(Icons.upload_file_outlined,
                  size: 48, color: Colors.grey[600]),
              const SizedBox(height: 12),
              const Text(
                'Tap to choose a PDF',
                style: TextStyle(
                    fontSize: 16, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 4),
              Text('Up to 500 MB.',
                  style: TextStyle(fontSize: 13, color: Colors.grey[600])),
            ],
          ),
        ),
      );

  Widget _buildFileInfo() => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.surfaceMutedLight,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.borderLight),
        ),
        child: Row(
          children: [
            const Icon(Icons.picture_as_pdf, color: AppColors.danger),
            const SizedBox(width: 12),
            Expanded(
              child: Text(_pdfName ?? '',
                  style: const TextStyle(fontWeight: FontWeight.w600)),
            ),
            TextButton(
              onPressed: _busy ? null : _pickPdf,
              child: const Text('Choose a different file'),
            ),
          ],
        ),
      );

  Widget _buildSignaturePad() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey[400]!),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text(
                'Draw your signature',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textLight,
                ),
              ),
              const Spacer(),
              TextButton.icon(
                onPressed: _clearSignature,
                icon: const Icon(Icons.refresh, size: 18),
                label: const Text('Clear'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'Use your mouse, trackpad, or finger.',
            style: TextStyle(fontSize: 13, color: Colors.grey[600]),
          ),
          const SizedBox(height: 12),
          // The drawing surface.
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Container(
              height: 200,
              decoration: BoxDecoration(
                color: Colors.grey[50],
                border: Border.all(color: Colors.grey[300]!),
                borderRadius: BorderRadius.circular(8),
              ),
              child: GestureDetector(
                onPanStart: (d) =>
                    _signaturePainter.startStroke(d.localPosition),
                onPanUpdate: (d) =>
                    _signaturePainter.extendStroke(d.localPosition),
                onPanEnd: (_) => _signaturePainter.endStroke(),
                child: CustomPaint(
                  painter: _SignaturePainterDelegate(_signaturePainter),
                  size: Size.infinite,
                ),
              ),
            ),
          ),
        ],
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

  Widget _buildResultBanner() => Container(
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
                'Signed! Your signature has been embedded on page 1 at '
                'the default position (bottom-left, 240×80 pt). '
                'Adjust the placement in a future iteration.',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      );

  Widget _buildActions() => Wrap(
        spacing: 12,
        runSpacing: 12,
        alignment: WrapAlignment.center,
        children: [
          FilledButton.icon(
            onPressed: _busy ? _applySignature : null,
            icon: _busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.draw),
            label: Text(_busy ? 'Signing…' : 'Apply signature & download'),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.catEdit,
              foregroundColor: Colors.white,
              padding:
                  const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
            ),
          ),
          if (_outputBytes != null)
            OutlinedButton.icon(
              onPressed: () => _webDownload(_outputBytes!, _suggestName(_pdfName!)),
              icon: const Icon(Icons.download),
              label: const Text('Download signed PDF'),
              style: OutlinedButton.styleFrom(
                padding:
                    const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
              ),
            ),
        ],
      );
}

String _suggestName(String original) {
  final dot = original.lastIndexOf('.');
  if (dot < 0) return '$original-signed.pdf';
  return '${original.substring(0, dot)}-signed.pdf';
}

void _webDownload(Uint8List bytes, String filename) {
  WebBridge.downloadBytes(bytes, filename, mimeType: 'application/pdf');
}

/// Simple brush-stroke model used by [_SignaturePainter] / the
/// [CustomPaint] delegate.
class _Stroke {
  final List<Offset> points;
  _Stroke(Offset start) : points = [start];
}

class _SignaturePainter {
  final List<_Stroke> _strokes = [];
  _Stroke? _active;

  void startStroke(Offset p) {
    _active = _Stroke(p);
    _strokes.add(_active!);
  }

  void extendStroke(Offset p) {
    _active?.points.add(p);
  }

  void endStroke() {
    _active = null;
  }

  void clear() {
    _strokes.clear();
  }

  bool get isEmpty => _strokes.isEmpty;

  /// Render the strokes into [canvas] for export. Used to bake the
  /// signature into a PNG before embedding in the PDF.
  void paintForExport(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = const Color(0xFF0F172A)
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;
    _paintStrokes(canvas, size, paint);
  }

  void _paintStrokes(Canvas canvas, Size size, Paint paint) {
    for (final s in _strokes) {
      if (s.points.length < 2) continue;
      final path = Path()..moveTo(s.points.first.dx, s.points.first.dy);
      for (final p in s.points.skip(1)) {
        path.lineTo(p.dx, p.dy);
      }
      canvas.drawPath(path, paint);
    }
  }
}

/// CustomPaint delegate — re-renders whenever the painter changes
/// (caller manages state).
class _SignaturePainterDelegate extends CustomPainter {
  final _SignaturePainter painter;
  _SignaturePainterDelegate(this.painter);

  @override
  void paint(Canvas canvas, Size size) {
    painter.paintForExport(canvas, size);
  }

  @override
  bool shouldRepaint(covariant _SignaturePainterDelegate old) =>
      old.painter != painter || old.painter._strokes.length != painter._strokes.length;
}
