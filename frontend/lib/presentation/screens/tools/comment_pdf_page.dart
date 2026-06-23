import 'dart:typed_data';
import 'dart:ui';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../../core/services/pdf_editor_service.dart';
import '../../../core/theme.dart';
import '../../../core/services/web_bridge.dart';

/// Comment PDF — add sticky-note comments anywhere on the page.
/// Each comment is anchored to (x, y) in top-down PDF coordinates.
class CommentPdfPage extends StatefulWidget {
  const CommentPdfPage({super.key});

  @override
  State<CommentPdfPage> createState() => _CommentPdfPageState();
}

class _CommentPdfPageState extends State<CommentPdfPage> {
  Uint8List? _pdfBytes;
  String? _pdfName;
  final List<_PendingComment> _pending = [];
  final _commentController = TextEditingController();
  Offset? _pendingAnchor;
  bool _busy = false;
  String? _error;
  Uint8List? _outputBytes;

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

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

  void _addPending(Offset anchor, String text) {
    if (text.trim().isEmpty) return;
    setState(() {
      _pending.add(_PendingComment(anchor: anchor, text: text.trim()));
      _pendingAnchor = null;
      _commentController.clear();
    });
  }

  Future<void> _applyComments() async {
    if (_pdfBytes == null) {
      setState(() => _error = 'Pick a PDF first.');
      return;
    }
    if (_pending.isEmpty) {
      setState(() => _error = 'Add at least one comment first.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _outputBytes = null;
    });
    try {
      Uint8List current = _pdfBytes!;
      // Apply comments one at a time. The service returns a new PDF
      // each call; we feed that into the next iteration so all comments
      // land on the same document.
      for (final c in _pending) {
        current = await PdfEditorService.addComment(
          pdfBytes: current,
          pageIndex: 0,
          x: c.anchor.dx,
          y: c.anchor.dy,
          text: c.text,
        );
      }
      if (!mounted) return;
      setState(() {
        _outputBytes = current;
        _busy = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not apply comments: $e';
        _busy = false;
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
                color: AppColors.catEdit.withOpacity(0.12),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.comment_outlined,
                  size: 18, color: AppColors.catEdit),
            ),
            const SizedBox(width: 10),
            const Text('Comment PDF'),
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
                  _buildCanvas(),
                  const SizedBox(height: 16),
                  _buildCommentInput(),
                  if (_pending.isNotEmpty) _buildPendingList(),
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
                Icon(Icons.lightbulb_outline,
                    size: 18, color: AppColors.catEdit),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Tap anywhere on the page below to drop a comment.',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: AppColors.catEdit,
                    ),
                  ),
                ),
              ],
            ),
            SizedBox(height: 12),
            Text(
              'Each comment is anchored to its tap location and exported as '
              'a PDF popup annotation. Other readers (Adobe, Preview, '
              'Chrome) will show a small marker at the same spot.',
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
              const Text('Tap to choose a PDF',
                  style: TextStyle(
                      fontSize: 16, fontWeight: FontWeight.w700)),
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
              child: const Text('Change file'),
            ),
          ],
        ),
      );

  Widget _buildCanvas() {
    // Stand-in "page canvas" — we render a paper-like rectangle where
    // taps drop comment anchors. A future iteration would render the
    // actual PDF page (via pdfx) so users tap on real content.
    return LayoutBuilder(
      builder: (context, constraints) {
        return GestureDetector(
          onTapDown: (d) {
            setState(() => _pendingAnchor = d.localPosition);
          },
          child: Container(
            height: 600,
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border.all(color: Colors.grey[300]!),
              borderRadius: BorderRadius.circular(8),
              boxShadow: [
                BoxShadow(
                    color: Colors.black.withOpacity(0.06),
                    blurRadius: 8,
                    offset: const Offset(0, 2)),
              ],
            ),
            child: Stack(
              children: [
                // Page placeholder hint.
                Positioned.fill(
                  child: Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.description_outlined,
                            size: 64, color: Colors.grey[300]),
                        const SizedBox(height: 8),
                        Text(
                          'Tap anywhere to place a comment',
                          style: TextStyle(
                              fontSize: 14, color: Colors.grey[400]),
                        ),
                      ],
                    ),
                  ),
                ),
                // Existing comment markers.
                ..._pending.map((c) => Positioned(
                      left: c.anchor.dx - 12,
                      top: c.anchor.dy - 12,
                      child: Container(
                        width: 24,
                        height: 24,
                        decoration: BoxDecoration(
                          color: Colors.amber,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                              color: const Color(0xFF92400E), width: 1.5),
                        ),
                        child: Center(
                          child: Text(
                            '${_pending.indexOf(c) + 1}',
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                              color: Color(0xFF92400E),
                            ),
                          ),
                        ),
                      ),
                    )),
                // Pending anchor marker.
                if (_pendingAnchor != null)
                  Positioned(
                    left: _pendingAnchor!.dx - 14,
                    top: _pendingAnchor!.dy - 14,
                    child: Container(
                      width: 28,
                      height: 28,
                      decoration: BoxDecoration(
                        color: AppColors.primary,
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: AppColors.primary.withOpacity(0.4),
                            blurRadius: 12,
                          ),
                        ],
                      ),
                      child: const Icon(Icons.add,
                          color: Colors.white, size: 18),
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildCommentInput() {
    if (_pendingAnchor == null) {
      return Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.surfaceMutedLight,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.borderLight),
        ),
        child: Row(
          children: [
            Icon(Icons.touch_app, size: 18, color: Colors.grey[500]),
            const SizedBox(width: 12),
            Text(
              'Tap on the page above to place a comment.',
              style: TextStyle(color: Colors.grey[600], fontSize: 14),
            ),
          ],
        ),
      );
    }
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.primary.withOpacity(0.04),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.primary.withOpacity(0.30)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(Icons.comment, size: 18, color: AppColors.primary),
              const SizedBox(width: 8),
              const Text('New comment',
                  style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: AppColors.primary)),
              const Spacer(),
              IconButton(
                onPressed: () =>
                    setState(() => _pendingAnchor = null),
                icon: const Icon(Icons.close, size: 18),
              ),
            ],
          ),
          TextField(
            controller: _commentController,
            autofocus: true,
            maxLines: 3,
            decoration: const InputDecoration(
              hintText: 'What did you want to say?',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              FilledButton.icon(
                onPressed: () => _addPending(
                    _pendingAnchor!, _commentController.text),
                icon: const Icon(Icons.add, size: 18),
                label: const Text('Add comment'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildPendingList() {
    return Container(
      margin: const EdgeInsets.only(top: 16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surfaceMutedLight,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.borderLight),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('${_pending.length} pending comment(s)',
              style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  color: AppColors.textLight)),
          const SizedBox(height: 8),
          ..._pending.asMap().entries.map((e) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 12,
                      backgroundColor: Colors.amber,
                      child: Text('${e.key + 1}',
                          style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                              color: Color(0xFF92400E))),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(e.value.text,
                          maxLines: 2, overflow: TextOverflow.ellipsis),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close, size: 16),
                      onPressed: () =>
                          setState(() => _pending.removeAt(e.key)),
                    ),
                  ],
                ),
              )),
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
        child: Row(
          children: [
            const Icon(Icons.check_circle, color: AppColors.success),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                'Comments embedded! ${_pending.length} annotation'
                '${_pending.length == 1 ? '' : 's'} added to the PDF.',
                style: const TextStyle(
                    fontSize: 14, fontWeight: FontWeight.w600),
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
            onPressed: _busy ? null : _applyComments,
            icon: _busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.save_alt),
            label: Text(_busy ? 'Applying…' : 'Apply & download'),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.catEdit,
              foregroundColor: Colors.white,
              padding:
                  const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
            ),
          ),
          if (_outputBytes != null)
            OutlinedButton.icon(
              onPressed: () =>
                  _webDownload(_outputBytes!, _suggestName(_pdfName!)),
              icon: const Icon(Icons.download),
              label: const Text('Download commented PDF'),
              style: OutlinedButton.styleFrom(
                padding:
                    const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
              ),
            ),
        ],
      );
}

class _PendingComment {
  final Offset anchor;
  final String text;
  _PendingComment({required this.anchor, required this.text});
}

String _suggestName(String original) {
  final dot = original.lastIndexOf('.');
  if (dot < 0) return '$original-comments.pdf';
  return '${original.substring(0, dot)}-comments.pdf';
}

void _webDownload(Uint8List bytes, String filename) {
  WebBridge.downloadBytes(bytes, filename, mimeType: 'application/pdf');
}

