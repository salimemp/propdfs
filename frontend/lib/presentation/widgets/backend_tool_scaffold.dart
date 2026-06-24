import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/services/tool_process_service.dart';
import '../../../core/theme.dart';

/// Reusable body for the dedicated crop / protect / unlock tool pages.
///
/// Each page provides:
///   1. a [form] widget that renders the tool-specific inputs (margins
///      for crop, password fields for protect / unlock),
///   2. a [buildParams] function that converts the form's current
///      state into the params dict the backend expects,
///   3. an [accent] color for the CTA.
///
/// The base widget handles file picking, the busy state, the
/// upload → process → poll → download pipeline, and the result
/// banner. Each page is then ~150 lines instead of ~300, and the
/// UX stays consistent across the three new tools.
class BackendToolScaffold extends ConsumerStatefulWidget {
  /// Tool-specific form, rendered between the file picker and the
  /// process button. Must report its validity via [ToolFormState.of
  /// (context).isValid].
  final Widget form;

  /// Read the form's current value and convert it to the params dict
  /// the backend expects for this tool (e.g. {"margins": {...}} for
  /// crop). May be called repeatedly during a session; the function
  /// itself is cheap.
  final Map<String, dynamic> Function() buildParams;

  /// Tool-specific accent color used for the CTA.
  final Color accent;

  /// Backend task type (e.g. "crop", "protect", "unlock").
  final String taskType;

  /// Human label for the file, used in the pick zone and the result
  /// banner (e.g. "Choose a PDF to crop").
  final String pickLabel;

  /// CTA label (e.g. "Crop PDF").
  final String ctaLabel;

  /// In-flight CTA label (e.g. "Cropping..."). Defaults to
  /// [ctaLabel] + "...".
  final String? busyLabel;

  /// Optional tooltip / hint shown under the CTA. Used by protect +
  /// unlock to remind the user their password is never sent to the
  /// server in plaintext over insecure transport.
  final String? ctaHint;

  const BackendToolScaffold({
    super.key,
    required this.form,
    required this.buildParams,
    required this.accent,
    required this.taskType,
    required this.pickLabel,
    required this.ctaLabel,
    this.busyLabel,
    this.ctaHint,
  });

  @override
  ConsumerState<BackendToolScaffold> createState() =>
      _BackendToolScaffoldState();
}

class _BackendToolScaffoldState extends ConsumerState<BackendToolScaffold> {
  Uint8List? _inputBytes;
  String? _inputName;
  int? _inputSize;
  bool _busy = false;
  String? _error;
  String? _stage; // 'Uploading', 'Processing', 'Downloading'
  Uint8List? _outputBytes;
  String? _outputName;

  @override
  Widget build(BuildContext context) {
    final canProcess = _inputBytes != null && !_busy;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 720),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _buildPickArea(),
              const SizedBox(height: 16),
              if (_inputBytes != null) ...[
                widget.form,
                const SizedBox(height: 16),
              ],
              if (_error != null) _buildErrorBanner(_error!),
              if (_outputBytes != null) _buildResultBanner(),
              const SizedBox(height: 16),
              _buildActions(canProcess),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPickArea() {
    final hasFile = _inputBytes != null;
    return InkWell(
      onTap: _busy ? null : _pickFile,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(32),
        decoration: BoxDecoration(
          border: Border.all(
            color: hasFile ? widget.accent : Colors.grey[400]!,
            width: hasFile ? 2 : 1.5,
            style: BorderStyle.solid,
          ),
          borderRadius: BorderRadius.circular(16),
          color: hasFile
              ? widget.accent.withOpacity(0.04)
              : AppColors.surfaceMutedLight,
        ),
        child: Column(
          children: [
            Icon(
              hasFile ? Icons.check_circle : Icons.upload_file,
              size: 40,
              color: hasFile ? widget.accent : Colors.grey[600],
            ),
            const SizedBox(height: 12),
            Text(
              hasFile
                  ? _inputName!
                  : widget.pickLabel,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: hasFile
                    ? AppColors.textLight
                    : AppColors.textMutedLight,
              ),
            ),
            if (hasFile && _inputSize != null) ...[
              const SizedBox(height: 4),
              Text(
                _formatBytes(_inputSize!),
                style: const TextStyle(
                  fontSize: 13,
                  color: AppColors.textMutedLight,
                ),
              ),
            ],
            if (!hasFile) ...[
              const SizedBox(height: 8),
              const Text(
                'PDF · max 200 MB',
                style: TextStyle(
                  fontSize: 12,
                  color: AppColors.textMutedLight,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildErrorBanner(String message) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.danger.withOpacity(0.06),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.danger.withOpacity(0.30)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.error_outline, color: AppColors.danger, size: 22),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
                fontSize: 14,
                color: AppColors.textLight,
                height: 1.5,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildResultBanner() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: widget.accent.withOpacity(0.06),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: widget.accent.withOpacity(0.30)),
      ),
      child: Row(
        children: [
          Icon(Icons.check_circle, color: widget.accent, size: 22),
          const SizedBox(width: 12),
          const Expanded(
            child: Text(
              'Done! Your file is ready below.',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppColors.textLight,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActions(bool canProcess) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (widget.ctaHint != null) ...[
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              widget.ctaHint!,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 12,
                color: AppColors.textMutedLight,
                height: 1.4,
              ),
            ),
          ),
        ],
        SizedBox(
          height: 52,
          child: FilledButton.icon(
            onPressed: canProcess ? _run : null,
            icon: _busy
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Icon(Icons.bolt, size: 20),
            label: Text(
              _busy
                  ? (_stage ?? widget.busyLabel ?? '${widget.ctaLabel}...')
                  : widget.ctaLabel,
            ),
            style: FilledButton.styleFrom(
              backgroundColor: widget.accent,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              textStyle: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ),
        if (_outputBytes != null && _outputName != null) ...[
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: _busy ? null : _downloadResult,
            icon: const Icon(Icons.download),
            label: Text('Download ${_outputName!}'),
            style: OutlinedButton.styleFrom(
              foregroundColor: widget.accent,
              side: BorderSide(color: widget.accent.withOpacity(0.5)),
              minimumSize: const Size.fromHeight(48),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
        ],
      ],
    );
  }

  Future<void> _pickFile() async {
    setState(() {
      _error = null;
      _outputBytes = null;
    });
    final picked = await ToolProcessService.pickPdf();
    if (picked == null || picked.bytes == null) return;
    setState(() {
      _inputBytes = picked.bytes;
      _inputName = picked.name;
      _inputSize = picked.size;
    });
  }

  Future<void> _run() async {
    if (_inputBytes == null || _inputName == null) return;
    Map<String, dynamic> params;
    try {
      params = widget.buildParams();
    } catch (e) {
      setState(() => _error = e.toString());
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _outputBytes = null;
      _stage = 'Uploading';
    });
    try {
      final docId = await ToolProcessService.uploadFile(
        ref,
        bytes: _inputBytes!,
        filename: _inputName!,
      );
      if (docId == null) throw Exception('Upload failed');
      if (!mounted) return;
      setState(() => _stage = 'Processing');
      final taskId = await ToolProcessService.queueTask(
        ref,
        documentId: docId,
        taskType: widget.taskType,
        params: params,
      );
      final result = await ToolProcessService.pollUntilDone(ref, taskId: taskId);
      if (!mounted) return;
      if (result.isFailed) {
        throw Exception(result.error ?? 'The task failed on the server.');
      }
      final resultUrl = result.resultUrl;
      if (resultUrl == null) {
        throw Exception('Task completed but no result URL was returned.');
      }
      setState(() => _stage = 'Downloading');
      final bytes = await ToolProcessService.downloadResult(ref, resultUrl);
      if (!mounted) return;
      setState(() {
        _outputBytes = bytes;
        _outputName = _suggestOutputName(_inputName!);
        _busy = false;
        _stage = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = _humaniseError(e);
        _busy = false;
        _stage = null;
      });
    }
  }

  void _downloadResult() {
    if (_outputBytes == null || _outputName == null) return;
    ToolProcessService.webDownload(_outputBytes!, _outputName!);
  }

  String _suggestOutputName(String original) {
    final dot = original.lastIndexOf('.');
    final stem = dot < 0 ? original : original.substring(0, dot);
    final suffix = switch (widget.taskType) {
      'crop' => 'cropped',
      'protect' => 'protected',
      'unlock' => 'unlocked',
      _ => 'processed',
    };
    return '$stem-$suffix.pdf';
  }

  String _humaniseError(Object e) {
    final s = e.toString();
    if (s.contains('Wrong password')) {
      return 'Wrong password. Please re-enter the password that protects '
          'this PDF.';
    }
    if (s.contains('Upload failed')) {
      return 'Upload failed. Check your connection and try again.';
    }
    if (s.contains('Polling timed out')) {
      return 'Processing is taking longer than expected. We\'ll keep it '
          'running — refresh in a minute and check your document list.';
    }
    return s;
  }

  String _formatBytes(int bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    var size = bytes.toDouble();
    var unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit++;
    }
    return '${size.toStringAsFixed(unit == 0 ? 0 : 1)} ${units[unit]}';
  }
}

/// Mounted by each tool page's form so the scaffold can read the
/// form's validity / current values when the user clicks Process.
class ToolFormScope extends InheritedWidget {
  final bool isValid;

  const ToolFormScope({
    super.key,
    required this.isValid,
    required super.child,
  });

  static bool of(BuildContext context) {
    final scope =
        context.dependOnInheritedWidgetOfExactType<ToolFormScope>();
    return scope?.isValid ?? true;
  }

  @override
  bool updateShouldNotify(ToolFormScope old) => old.isValid != isValid;
}
