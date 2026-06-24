import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme.dart';
import '../../../core/services/web_bridge.dart';

/// Shared layout for the AI tool pages (summarize, translate,
/// extract, fill-forms). Each tool:
///   1. Renders an [extraForm] (language dropdown, extraction
///      type, etc.) between the file picker and the submit
///      button.
///   2. Uploads the picked PDF to a backend endpoint via
///      [submit]. The endpoint returns JSON — never a file.
///   3. Renders the JSON response through [buildResult], which
///      is tool-specific (e.g. plain text for summarize, a
///      table for extract, a list of form fields for fill-forms).
///
/// The scaffold is intentionally lighter than
/// [BackendToolScaffold] — AI tools don't have a polling step
/// (everything happens in the same request) and they don't
/// return a file to download (except fill-forms, which does its
/// own download dance in [buildResult]).
class AiToolScaffold extends ConsumerStatefulWidget {
  /// Tool-specific form widget (language dropdown, etc.).
  final Widget extraForm;

  /// Accent color for the CTA. Tool-specific.
  final Color accent;

  /// Tool title shown in the AppBar.
  final String title;

  /// Hero icon shown in the AppBar leading slot.
  final IconData heroIcon;

  /// CTA label, e.g. "Summarize".
  final String ctaLabel;

  /// In-flight label.
  final String? busyLabel;

  /// The actual API call. Implementations POST the file + any
  /// extra form values and return a parsed JSON map. Errors
  /// should throw a [DioException] (or any other exception);
  /// the scaffold surfaces them.
  final Future<Map<String, dynamic>> Function({
    required Uint8List bytes,
    required String filename,
    required Map<String, dynamic> formValues,
  }) submit;

  /// Build the result widget from the API response. Different
  /// per tool (text view, JSON pretty-print, field form, etc.).
  final Widget Function(BuildContext, Map<String, dynamic>) buildResult;

  /// Optional hint shown under the CTA, e.g. cost estimate.
  final String? ctaHint;

  /// Optional helper to extract the file download bytes from
  /// the response. Used by fill-forms which does a second
  /// /apply POST to write the values back to the PDF.
  final Future<Uint8List> Function(Uint8List source, Map<String, dynamic> response)?
      downloadFile;

  /// Filename for the downloaded file (if [downloadFile] is set).
  final String? downloadFilename;

  const AiToolScaffold({
    super.key,
    required this.extraForm,
    required this.accent,
    required this.title,
    required this.heroIcon,
    required this.ctaLabel,
    required this.submit,
    required this.buildResult,
    this.busyLabel,
    this.ctaHint,
    this.downloadFile,
    this.downloadFilename,
  });

  @override
  ConsumerState<AiToolScaffold> createState() => _AiToolScaffoldState();
}

class _AiToolScaffoldState extends ConsumerState<AiToolScaffold> {
  Uint8List? _inputBytes;
  String? _inputName;
  int? _inputSize;
  bool _busy = false;
  String? _error;
  Map<String, dynamic>? _response;
  Uint8List? _downloadBytes;
  String? _downloadName;

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
                color: widget.accent.withOpacity(0.12),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(widget.heroIcon, size: 18, color: widget.accent),
            ),
            const SizedBox(width: 10),
            Text(widget.title),
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
                _buildPickArea(),
                const SizedBox(height: 16),
                if (_inputBytes != null) ...[
                  widget.extraForm,
                  const SizedBox(height: 16),
                ],
                if (_error != null) _buildErrorBanner(_error!),
                if (_response != null) widget.buildResult(context, _response!),
                const SizedBox(height: 16),
                _buildActions(),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Column(
      children: [
        Container(
          width: 80,
          height: 80,
          decoration: BoxDecoration(
            color: widget.accent.withOpacity(0.10),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Icon(widget.heroIcon, size: 40, color: widget.accent),
        ),
        const SizedBox(height: 16),
        Text(
          widget.title,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.w800,
            color: AppColors.textLight,
            letterSpacing: -0.5,
          ),
        ),
      ],
    );
  }

  Widget _buildPickArea() {
    final hasFile = _inputBytes != null;
    return InkWell(
      onTap: _busy ? null : _pickFile,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          border: Border.all(
            color: hasFile ? widget.accent : Colors.grey[400]!,
            width: hasFile ? 2 : 1.5,
          ),
          borderRadius: BorderRadius.circular(16),
          color: hasFile
              ? widget.accent.withOpacity(0.04)
              : AppColors.surfaceMutedLight,
        ),
        child: Row(
          children: [
            Icon(
              hasFile ? Icons.check_circle : Icons.upload_file,
              size: 32,
              color: hasFile ? widget.accent : Colors.grey[600],
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    hasFile ? _inputName! : 'Choose a PDF',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: hasFile
                          ? AppColors.textLight
                          : AppColors.textMutedLight,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (hasFile && _inputSize != null)
                    Text(
                      _formatBytes(_inputSize!),
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.textMutedLight,
                      ),
                    ),
                  if (!hasFile)
                    const Text(
                      'PDF · max 200 MB',
                      style: TextStyle(
                        fontSize: 12,
                        color: AppColors.textMutedLight,
                      ),
                    ),
                ],
              ),
            ),
            if (hasFile)
              IconButton(
                icon: const Icon(Icons.close, size: 20),
                onPressed: _busy
                    ? null
                    : () => setState(() {
                          _inputBytes = null;
                          _inputName = null;
                          _inputSize = null;
                          _response = null;
                          _error = null;
                        }),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildErrorBanner(String message) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.danger.withOpacity(0.06),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.danger.withOpacity(0.30)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(
              Icons.error_outline,
              color: AppColors.danger,
              size: 22,
            ),
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
      ),
    );
  }

  Widget _buildActions() {
    final canRun = _inputBytes != null && !_busy;
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
            onPressed: canRun ? _run : null,
            icon: _busy
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : Icon(widget.heroIcon, size: 20),
            label: Text(
              _busy
                  ? (widget.busyLabel ?? '${widget.ctaLabel}...')
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
        if (_downloadBytes != null) ...[
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: _busy
                ? null
                : () => _doDownload(_downloadBytes!, _downloadName ?? 'result.pdf'),
            icon: const Icon(Icons.download),
            label: Text('Download ${_downloadName ?? 'result.pdf'}'),
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
      _response = null;
      _downloadBytes = null;
    });
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['pdf'],
      withData: true,
    );
    if (result == null || result.files.isEmpty) return;
    final f = result.files.first;
    if (f.bytes == null) {
      setState(() => _error = 'Could not read the selected file.');
      return;
    }
    setState(() {
      _inputBytes = f.bytes;
      _inputName = f.name;
      _inputSize = f.size;
      _response = null;
    });
  }

  Future<void> _run() async {
    if (_inputBytes == null || _inputName == null) return;
    setState(() {
      _busy = true;
      _error = null;
      _response = null;
      _downloadBytes = null;
    });
    try {
      final result = await widget.submit(
        bytes: _inputBytes!,
        filename: _inputName!,
        formValues: const {},
      );
      if (!mounted) return;

      // If the tool wires up a downloadFile callback, fetch
      // the filled PDF too (used by fill-forms after the user
      // approves the suggested values).
      if (widget.downloadFile != null) {
        try {
          final dl = await widget.downloadFile!(_inputBytes!, result);
          if (!mounted) return;
          setState(() {
            _downloadBytes = dl;
            _downloadName = widget.downloadFilename ?? 'filled.pdf';
          });
        } catch (e) {
          // Don't fail the whole run — the user can still
          // retry the download by clicking again.
          debugPrint('downloadFile failed: $e');
        }
      }

      if (!mounted) return;
      setState(() {
        _response = result;
        _busy = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = _humaniseError(e);
        _busy = false;
      });
    }
  }

  void _doDownload(Uint8List bytes, String name) {
    WebBridge.downloadBytes(bytes, name, mimeType: 'application/pdf');
  }

  String _humaniseError(Object e) {
    final s = e.toString();
    if (e is DioException) {
      final code = e.response?.statusCode;
      final detail = e.response?.data is Map
          ? (e.response!.data as Map)['detail']?.toString()
          : null;
      if (code == 401) return 'You need to sign in to use AI tools.';
      if (code == 402 || code == 429) {
        return 'AI quota reached. Upgrade your plan or try again '
            'in a few minutes.';
      }
      if (detail != null) return detail;
    }
    if (s.contains('Connection') || s.contains('SocketException')) {
      return 'Network error — check your connection and try again.';
    }
    if (s.contains('TimeoutException')) {
      return 'The AI took too long. Try a smaller document or retry.';
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

/// Small helper to pretty-print a JSON map as Dart code for
/// debug views. Used by ai-extract and ai-fill-forms.
String prettyJson(Map<String, dynamic> data) {
  const encoder = JsonEncoder.withIndent('  ');
  return encoder.convert(data);
}
