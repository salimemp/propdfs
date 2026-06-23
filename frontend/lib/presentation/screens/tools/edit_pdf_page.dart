import 'dart:typed_data';
import 'dart:ui';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../../core/services/pdf_editor_service.dart';
import '../../../core/theme.dart';
import '../../../core/services/web_bridge.dart';

/// Edit PDF — a minimal MVP editor that lets the user:
/// - add text at any position on page 1
/// - draw rectangles, ellipses, lines
/// - save and download the modified PDF
///
/// Real iLovePDF-grade editors take months; this is a working slice that
/// proves the architecture and gives the user something they can act on
/// today. Future iterations will add multi-page support, image insertion,
/// text editing on existing content (OCR + re-typeset), and forms.
class EditPdfPage extends StatefulWidget {
  const EditPdfPage({super.key});

  @override
  State<EditPdfPage> createState() => _EditPdfPageState();
}

class _EditPdfPageState extends State<EditPdfPage> {
  Uint8List? _pdfBytes;
  String? _pdfName;
  final List<List<PdfEditOperation>> _opsByPage = [];
  int _currentPage = 0;
  int _pageCount = 1;
  _EditTool _activeTool = _EditTool.text;
  Color _activeColor = const Color(0xFFEF4444);
  double _activeStrokeWidth = 2;
  Offset? _dragStart;
  Offset? _dragCurrent;
  bool _busy = false;
  String? _error;
  String? _statusMessage;
  Uint8List? _outputBytes;
  final _textController = TextEditingController(text: 'Type here');

  // Edit ops keyed by page index. Empty for pages without edits so we
  // don't burn cycles re-encoding pages the user didn't touch.
  List<PdfEditOperation> get _ops =>
      _opsByPage.length > _currentPage ? _opsByPage[_currentPage] : <PdfEditOperation>[];

  void _addOp(PdfEditOperation op) {
    while (_opsByPage.length <= _currentPage) {
      _opsByPage.add([]);
    }
    _opsByPage[_currentPage].add(op);
  }

  void _popOp() {
    if (_ops.isEmpty) return;
    setState(() {
      _opsByPage[_currentPage].removeLast();
      if (_opsByPage[_currentPage].isEmpty) {
        _opsByPage.removeAt(_currentPage);
        if (_currentPage >= _opsByPage.length &&
            _opsByPage.isNotEmpty) {
          _currentPage = _opsByPage.length - 1;
        }
      }
    });
  }

  void _clearOps() {
    setState(() => _opsByPage.clear());
  }

  static const _palette = <Color>[
    Color(0xFFEF4444), // red
    Color(0xFFF59E0B), // amber
    Color(0xFF10B981), // emerald
    Color(0xFF3B82F6), // blue
    Color(0xFF8B5CF6), // violet
    Color(0xFF0F172A), // near-black
  ];

  @override
  void dispose() {
    _textController.dispose();
    super.dispose();
  }

  Future<void> _pickPdf() async {
    setState(() {
      _error = null;
      _outputBytes = null;
      _opsByPage.clear();
      _currentPage = 0;
      _pageCount = 1;
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
      // Resolve page count asynchronously; show 1 until it returns.
      _pageCount = 1;
    });
    final count = await PdfEditorService.pageCount(f.bytes!);
    if (!mounted) return;
    setState(() => _pageCount = count);
  }

  Future<void> _apply() async {
    if (_pdfBytes == null) {
      setState(() => _error = 'Pick a PDF first.');
      return;
    }
    if (_opsByPage.isEmpty) {
      setState(() => _error = 'Add at least one edit first.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _outputBytes = null;
      _statusMessage = null;
    });
    try {
      // Apply per-page edits sequentially. Pages without edits are
      // skipped — we only re-encode pages the user actually touched.
      Uint8List current = _pdfBytes!;
      final totalEdits =
          _opsByPage.fold<int>(0, (sum, ops) => sum + ops.length);
      var done = 0;
      for (var i = 0; i < _opsByPage.length; i++) {
        if (_opsByPage[i].isEmpty) continue;
        if (!mounted) return;
        setState(() => _statusMessage =
            'Applying ${++done} of $totalEdits edits…');
        current = await PdfEditorService.edit(
          pdfBytes: current,
          pageIndex: i,
          operations: _opsByPage[i],
        );
      }
      if (!mounted) return;
      setState(() {
        _outputBytes = current;
        _busy = false;
        _statusMessage = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not apply edits: $e';
        _busy = false;
        _statusMessage = null;
      });
    }
  }

  Offset _canvasToPdf(Offset c, Size canvasSize) {
    // Map canvas pixels to PDF points. We treat the canvas as a
    // top-down coordinate system at the PDF's natural aspect ratio.
    // For MVP we assume US Letter (612 × 792 points) — pages with
    // different dimensions will be visually distorted but the operation
    // bounding boxes will still land correctly because we scale.
    const pdfW = 612.0;
    const pdfH = 792.0;
    final sx = pdfW / canvasSize.width;
    final sy = pdfH / canvasSize.height;
    return Offset(c.dx * sx, c.dy * sy);
  }

  void _commitDragAsShape() {
    if (_dragStart == null || _dragCurrent == null) return;
    final size = Size(
      (_dragCurrent!.dx - _dragStart!.dx).abs(),
      (_dragCurrent!.dy - _dragStart!.dy).abs(),
    );
    if (size.width < 4 || size.height < 4) return;
    final left = _dragStart!.dx < _dragCurrent!.dx
        ? _dragStart!.dx
        : _dragCurrent!.dx;
    final top = _dragStart!.dy < _dragCurrent!.dy
        ? _dragStart!.dy
        : _dragCurrent!.dy;
    final rect = Rect.fromLTWH(left, top, size.width, size.height);
    final argb = _activeColor.value;
    setState(() {
      switch (_activeTool) {
        case _EditTool.text:
        case _EditTool.image:
          break; // text uses textField commit, image is future work
        case _EditTool.rect:
          _addOp(PdfEditOperation.rect(rect, colorArgb: argb));
          break;
        case _EditTool.ellipse:
          _addOp(PdfEditOperation.ellipse(rect, colorArgb: argb));
          break;
        case _EditTool.line:
          // For line, we draw a thin rect along the drag direction.
          final lineRect = _activeTool == _EditTool.line
              ? Rect.fromLTWH(
                  left,
                  top + size.height / 2 - _activeStrokeWidth / 2,
                  size.width,
                  _activeStrokeWidth,
                )
              : rect;
          _addOp(PdfEditOperation.line(lineRect, colorArgb: argb));
          break;
      }
      _dragStart = null;
      _dragCurrent = null;
    });
  }

  void _commitText(Offset canvasPos) {
    final argb = _activeColor.value;
    const fontSize = 18.0;
    final pdfRect = Rect.fromLTWH(canvasPos.dx, canvasPos.dy, 200, 24);
    setState(() {
      _addOp(PdfEditOperation.text(
        _textController.text,
        fontSize: fontSize,
        colorArgb: argb,
        at: pdfRect,
      ));
    });
  }

  /// Open a dialog that lets the user edit ALL text on the current
  /// page. The existing text is extracted via PdfTextExtractor, displayed
  /// in a multi-line editor; on save the original text is white-out'd and
  /// the new text is drawn at the top of the page.
  ///
  /// This is a real (if rough) text-content editor — fine for fixing
  /// typos or re-flowing a paragraph. For complex multi-column layouts
  /// you'd want a richer editor that preserves the original
  /// coordinates, but that's a much bigger project.
  Future<void> _openTextReplaceDialog() async {
    if (_pdfBytes == null) return;
    setState(() => _statusMessage = 'Extracting text from page…');
    String original;
    try {
      original = await PdfEditorService.extractPageText(
        _pdfBytes!,
        _currentPage,
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not extract text: $e';
        _statusMessage = null;
      });
      return;
    }
    if (!mounted) return;
    setState(() => _statusMessage = null);

    final controller = TextEditingController(text: original);
    final result = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Replace text — page ${_currentPage + 1}'),
        content: SizedBox(
          width: 600,
          height: 400,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Edit the text below. On save, we\'ll draw a white box over '
                'the original text and write the new text at the top of the '
                'page.',
                style: TextStyle(fontSize: 13, color: Colors.grey[700]),
              ),
              const SizedBox(height: 12),
              Expanded(
                child: TextField(
                  controller: controller,
                  maxLines: null,
                  expands: true,
                  textAlignVertical: TextAlignVertical.top,
                  decoration: const InputDecoration(
                    border: OutlineInputBorder(),
                    contentPadding: EdgeInsets.all(12),
                  ),
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(null),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(controller.text),
            child: const Text('Save'),
          ),
        ],
      ),
    );

    if (result == null || !mounted) return;
    final newText = result;

    setState(() {
      _statusMessage = 'Applying text replacement…';
    });
    try {
      // Step 1: white-out the existing text region (full page minus
      // 50pt margins is a reasonable approximation when we don't have
      // per-line coordinates from pdfx).
      final sizes = await PdfEditorService.pageSizes(_pdfBytes!);
      if (_currentPage >= sizes.length) {
        throw StateError('Page ${_currentPage + 1} out of range.');
      }
      final size = sizes[_currentPage];
      final whiteRect = Rect.fromLTWH(
        36,
        36,
        size.width - 72,
        size.height - 72,
      );
      final afterWhiteout = await PdfEditorService.edit(
        pdfBytes: _pdfBytes!,
        pageIndex: _currentPage,
        operations: [
          PdfEditOperation.rect(whiteRect,
              colorArgb: 0xFFFFFFFF), // opaque white
        ],
      );

      // Step 2: write the new text at the top of the page.
      final textRect = Rect.fromLTWH(
        36,
        36,
        size.width - 72,
        size.height - 72,
      );
      final finalBytes = await PdfEditorService.edit(
        pdfBytes: afterWhiteout,
        pageIndex: _currentPage,
        operations: [
          PdfEditOperation.text(
            newText,
            fontSize: 11,
            colorArgb: 0xFF000000,
            at: textRect,
          ),
        ],
      );

      if (!mounted) return;
      setState(() {
        _pdfBytes = finalBytes;
        // Reset edit state for this page since we just wholesale
        // replaced its content.
        if (_opsByPage.length > _currentPage) {
          _opsByPage[_currentPage] = [];
        }
        _statusMessage = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not apply text replacement: $e';
        _statusMessage = null;
      });
    }
  }

  void _undo() => _popOp();

  void _clear() => _clearOps();

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
              child: const Icon(Icons.edit,
                  size: 18, color: AppColors.catEdit),
            ),
            const SizedBox(width: 10),
            const Text('Edit PDF'),
          ],
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 900),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _buildHeader(),
                const SizedBox(height: 16),
                if (_pdfBytes == null) _buildPdfPicker(),
                if (_pdfBytes != null) ...[
                  _buildToolbar(),
                  const SizedBox(height: 12),
                  _buildEditorCanvas(),
                  const SizedBox(height: 12),
                  if (_error != null) _buildErrorBanner(_error!),
                  if (_outputBytes != null) _buildResultBanner(),
                  const SizedBox(height: 12),
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
        padding: const EdgeInsets.all(16),
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
                Icon(Icons.edit, size: 18, color: AppColors.catEdit),
                SizedBox(width: 8),
                Text(
                  'Edit PDF — minimal MVP',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.catEdit,
                  ),
                ),
              ],
            ),
            SizedBox(height: 8),
            Text(
              'Add text, rectangles, ellipses, and lines to page 1. '
              'Pick a tool, drag on the canvas, then "Apply & download".',
              style: TextStyle(
                fontSize: 13,
                color: AppColors.textMutedLight,
                height: 1.5,
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
              const Text('Tap to choose a PDF to edit',
                  style:
                      TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            ],
          ),
        ),
      );

  Widget _buildToolbar() {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: AppColors.surfaceMutedLight,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.borderLight),
      ),
      child: Column(
        children: [
          // Page picker row.
          Row(
            children: [
              const Icon(Icons.description_outlined,
                  size: 18, color: AppColors.textLight),
              const SizedBox(width: 8),
              const Text('Editing page',
                  style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(width: 12),
              Expanded(
                child: Row(
                  children: [
                    IconButton(
                      onPressed: _currentPage > 0
                          ? () => setState(() => _currentPage--)
                          : null,
                      icon: const Icon(Icons.chevron_left),
                      tooltip: 'Previous page',
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceLight,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: AppColors.borderLight),
                      ),
                      child: Text(
                        '${_currentPage + 1} / $_pageCount',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                    IconButton(
                      onPressed: _currentPage + 1 < _pageCount
                          ? () => setState(() => _currentPage++)
                          : null,
                      icon: const Icon(Icons.chevron_right),
                      tooltip: 'Next page',
                    ),
                    const SizedBox(width: 8),
                    Text(
                      _ops.isEmpty
                          ? 'No edits yet'
                          : '${_ops.length} edit${_ops.length == 1 ? '' : 's'} on this page',
                      style: TextStyle(
                        fontSize: 12,
                        color: _ops.isEmpty
                            ? Colors.grey[500]
                            : AppColors.primary,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const Divider(height: 16),
          // Tool row.
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final tool in _EditTool.values)
                _ToolChip(
                  tool: tool,
                  active: tool == _activeTool,
                  onTap: () => setState(() => _activeTool = tool),
                ),
            ],
          ),
          const SizedBox(height: 8),
          // Color row.
          Wrap(
            spacing: 6,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              for (final c in _palette)
                GestureDetector(
                  onTap: () => setState(() => _activeColor = c),
                  child: Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(
                      color: c,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: c.value == _activeColor.value
                            ? AppColors.textLight
                            : Colors.transparent,
                        width: 2,
                      ),
                    ),
                  ),
                ),
              if (_activeTool == _EditTool.text) ...[
                const SizedBox(width: 12),
                SizedBox(
                  width: 160,
                  child: TextField(
                    controller: _textController,
                    decoration: const InputDecoration(
                      isDense: true,
                      hintText: 'Text to insert',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
              ],
              const SizedBox(width: 12),
              TextButton.icon(
                onPressed: _ops.isEmpty ? null : _undo,
                icon: const Icon(Icons.undo, size: 18),
                label: const Text('Undo'),
              ),
              TextButton.icon(
                onPressed: _opsByPage.every((p) => p.isEmpty)
                    ? null
                    : _clear,
                icon: const Icon(Icons.delete_sweep, size: 18),
                label: const Text('Clear'),
              ),
              TextButton.icon(
                onPressed: _pdfBytes == null || _busy
                    ? null
                    : _openTextReplaceDialog,
                icon: const Icon(Icons.text_fields, size: 18),
                label: const Text('Replace text'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildEditorCanvas() {
    return LayoutBuilder(
      builder: (context, constraints) {
        return GestureDetector(
          onTapUp: (d) {
            if (_activeTool == _EditTool.text) {
              _commitText(d.localPosition);
            }
          },
          onPanStart: (d) {
            if (_activeTool == _EditTool.text) return;
            setState(() {
              _dragStart = d.localPosition;
              _dragCurrent = d.localPosition;
            });
          },
          onPanUpdate: (d) {
            if (_activeTool == _EditTool.text) return;
            setState(() => _dragCurrent = d.localPosition);
          },
          onPanEnd: (_) {
            if (_activeTool == _EditTool.text) return;
            _commitDragAsShape();
          },
          child: Container(
            height: 700,
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
                // Page background hint.
                Positioned.fill(
                  child: Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.description_outlined,
                            size: 80, color: Colors.grey[300]),
                        const SizedBox(height: 8),
                        Text(
                          _pdfName ?? 'Edit area',
                          style: TextStyle(
                              fontSize: 14, color: Colors.grey[400]),
                        ),
                      ],
                    ),
                  ),
                ),
                // Committed operations.
                ..._ops.where((op) => op.rect != null).map((op) {
                  final r = op.rect!;
                  return Positioned.fromRect(
                    rect: Rect.fromLTWH(r.left, r.top, r.width, r.height),
                    child: _renderOpPreview(op),
                  );
                }),
                // Live drag preview.
                if (_dragStart != null && _dragCurrent != null)
                  Positioned.fromRect(
                    rect: Rect.fromLTRB(
                      _dragStart!.dx < _dragCurrent!.dx
                          ? _dragStart!.dx
                          : _dragCurrent!.dx,
                      _dragStart!.dy < _dragCurrent!.dy
                          ? _dragStart!.dy
                          : _dragCurrent!.dy,
                      (_dragCurrent!.dx - _dragStart!.dx).abs(),
                      (_dragCurrent!.dy - _dragStart!.dy).abs(),
                    ),
                    child: _renderShapePreview(),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _renderOpPreview(PdfEditOperation op) {
    if (op.kind == 'text' && op.text != null) {
      return Align(
        alignment: Alignment.centerLeft,
        child: Text(
          op.text!,
          style: TextStyle(
            fontSize: op.fontSize ?? 12,
            color: Color(op.colorArgb ?? 0xFF000000),
            fontWeight: FontWeight.w500,
          ),
        ),
      );
    }
    return _renderShapeForOp(op);
  }

  Widget _renderShapePreview() {
    switch (_activeTool) {
      case _EditTool.rect:
        return Container(
          decoration: BoxDecoration(
            border: Border.all(color: _activeColor, width: _activeStrokeWidth),
          ),
        );
      case _EditTool.ellipse:
        return Container(
          decoration: BoxDecoration(
            shape: BoxShape.rectangle,
            border: Border.all(color: _activeColor, width: _activeStrokeWidth),
            borderRadius: BorderRadius.circular(999),
          ),
        );
      case _EditTool.line:
        return Container(height: _activeStrokeWidth, color: _activeColor);
      case _EditTool.text:
      case _EditTool.image:
        return const SizedBox.shrink();
    }
  }

  Widget _renderShapeForOp(PdfEditOperation op) {
    switch (op.kind) {
      case 'rect':
        return Container(
          decoration: BoxDecoration(
            border: Border.all(
              color: Color(op.colorArgb ?? 0xFF000000),
              width: _activeStrokeWidth,
            ),
          ),
        );
      case 'ellipse':
        return Container(
          decoration: BoxDecoration(
            border: Border.all(
              color: Color(op.colorArgb ?? 0xFF000000),
              width: _activeStrokeWidth,
            ),
            borderRadius: BorderRadius.circular(999),
          ),
        );
      case 'line':
        return Container(
          height: _activeStrokeWidth,
          color: Color(op.colorArgb ?? 0xFF000000),
        );
      default:
        return const SizedBox.shrink();
    }
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
                'Edits applied! ${_ops.length} operation'
                '${_ops.length == 1 ? '' : 's'} added to the PDF.',
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
            onPressed: _busy ? null : _apply,
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
              label: const Text('Download edited PDF'),
              style: OutlinedButton.styleFrom(
                padding:
                    const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
              ),
            ),
        ],
      );
}

enum _EditTool { text, rect, ellipse, line, image }

class _ToolChip extends StatelessWidget {
  final _EditTool tool;
  final bool active;
  final VoidCallback onTap;
  const _ToolChip({
    required this.tool,
    required this.active,
    required this.onTap,
  });

  IconData get _icon {
    switch (tool) {
      case _EditTool.text:
        return Icons.text_fields;
      case _EditTool.rect:
        return Icons.crop_square;
      case _EditTool.ellipse:
        return Icons.circle_outlined;
      case _EditTool.line:
        return Icons.horizontal_rule;
      case _EditTool.image:
        return Icons.image_outlined;
    }
  }

  String get _label {
    switch (tool) {
      case _EditTool.text:
        return 'Text';
      case _EditTool.rect:
        return 'Rect';
      case _EditTool.ellipse:
        return 'Ellipse';
      case _EditTool.line:
        return 'Line';
      case _EditTool.image:
        return 'Image';
    }
  }

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: active ? AppColors.catEdit : Colors.white,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: active ? AppColors.catEdit : Colors.grey[300]!,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(_icon,
                size: 16,
                color: active ? Colors.white : AppColors.textLight),
            const SizedBox(width: 6),
            Text(_label,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: active ? Colors.white : AppColors.textLight,
                )),
          ],
        ),
      ),
    );
  }
}

String _suggestName(String original) {
  final dot = original.lastIndexOf('.');
  if (dot < 0) return '$original-edited.pdf';
  return '${original.substring(0, dot)}-edited.pdf';
}

void _webDownload(Uint8List bytes, String filename) {
  WebBridge.downloadBytes(bytes, filename, mimeType: 'application/pdf');
}
