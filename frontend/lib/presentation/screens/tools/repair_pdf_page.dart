import 'dart:async';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../../core/services/pdf_editor_service.dart';
import '../../../core/theme.dart';
import '../../../core/services/web_bridge.dart';

/// Web download shim. Implemented as a JS interop call from
/// `web/index.html`. Falls back to in-app storage on native (handled by
/// the platform channel).
void _webDownload(Uint8List bytes, String filename) {
  WebBridge.downloadBytes(bytes, filename, mimeType: 'application/pdf');
}

/// Client-side PDF repair. Opens a PDF, copies every page onto a fresh
/// document via [PdfEditorService.repair], and returns the rebuilt
/// bytes. The rebuild fixes structural damage (cross-reference table,
/// object streams, page tree) without altering visible content.
///
/// 100% client-side: the bytes never leave the device.
class RepairPdfPage extends StatefulWidget {
  const RepairPdfPage({super.key});

  @override
  State<RepairPdfPage> createState() => _RepairPdfPageState();
}

class _RepairPdfPageState extends State<RepairPdfPage> {
  Uint8List? _inputBytes;
  String? _inputName;
  int? _inputSize;
  bool _busy = false;
  String? _error;
  Uint8List? _outputBytes;

  Future<void> _pickFile() async {
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
    if (f.bytes == null) {
      setState(() => _error = 'Could not read the selected file.');
      return;
    }
    setState(() {
      _inputBytes = f.bytes;
      _inputName = f.name;
      _inputSize = f.size;
    });
  }

  Future<void> _repair() async {
    if (_inputBytes == null) return;
    setState(() {
      _busy = true;
      _error = null;
      _outputBytes = null;
    });
    try {
      final repaired = await PdfEditorService.repair(_inputBytes!);
      if (!mounted) return;
      setState(() {
        _outputBytes = repaired;
        _busy = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not repair this PDF. The damage may be in the '
            'content stream, which our tool can\'t recover.\n\n'
            'Try Compress instead — it can sometimes help, or use the '
            'original source file if you have it.\n\n'
            'Details: $e';
        _busy = false;
      });
    }
  }

  String _suggestOutputName(String original) {
    final dot = original.lastIndexOf('.');
    if (dot < 0) return '$original-repaired.pdf';
    return '${original.substring(0, dot)}-repaired.pdf';
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
              child: const Icon(Icons.build,
                  size: 18, color: AppColors.catOptimize),
            ),
            const SizedBox(width: 10),
            const Text('Repair PDF'),
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
                if (_error != null) _buildErrorBanner(_error!),
                if (_outputBytes != null) _buildResultBanner(),
                const SizedBox(height: 16),
                _buildActions(),
                const SizedBox(height: 32),
                _buildHowItWorks(),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
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
              Expanded(
                child: Text(
                  '100% private — your file is processed in your browser',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.catOptimize,
                  ),
                ),
              ),
            ],
          ),
          SizedBox(height: 12),
          Text(
            'Repair PDF rebuilds the internal structure of a damaged PDF — '
            'the cross-reference table, object streams, and page tree — '
            "without altering the visible content. Use it when a PDF won't "
            'open, shows "file is corrupt", or renders with missing pages.',
            style: TextStyle(
              fontSize: 14,
              color: AppColors.textMutedLight,
              height: 1.6,
            ),
          ),
        ],
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
            color: hasFile ? AppColors.catOptimize : Colors.grey[400]!,
            width: hasFile ? 2 : 1.5,
            style: BorderStyle.solid,
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
              hasFile ? _inputName! : 'Tap to choose a damaged PDF',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: hasFile
                    ? AppColors.textLight
                    : AppColors.textMutedLight,
              ),
              textAlign: TextAlign.center,
            ),
            if (hasFile && _inputSize != null) ...[
              const SizedBox(height: 4),
              Text(
                _formatBytes(_inputSize!),
                style:
                    TextStyle(fontSize: 13, color: Colors.grey[600]),
              ),
            ] else ...[
              const SizedBox(height: 4),
              Text(
                'Up to 500 MB. We never upload it.',
                style:
                    TextStyle(fontSize: 13, color: Colors.grey[600]),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildErrorBanner(String msg) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.danger.withOpacity(0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.danger.withOpacity(0.30)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.error_outline, color: AppColors.danger),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              msg,
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
    final ratio = _outputBytes!.lengthInBytes / _inputSize!;
    final verdict = ratio < 0.95
        ? 'smaller'
        : ratio > 1.05
            ? 'slightly larger (still structurally clean)'
            : 'similar size';
    return Container(
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
              'Repaired! The new file is ${_formatBytes(_outputBytes!.lengthInBytes)} — $verdict.',
              style: const TextStyle(
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

  Widget _buildActions() {
    final canRepair = _inputBytes != null && !_busy;
    final canDownload = _outputBytes != null;
    return Wrap(
      spacing: 12,
      runSpacing: 12,
      alignment: WrapAlignment.center,
      children: [
        FilledButton.icon(
          onPressed: canRepair ? _repair : null,
          icon: _busy
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : const Icon(Icons.build),
          label: Text(_busy ? 'Repairing…' : 'Repair PDF'),
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
                _webDownload(_outputBytes!, _suggestOutputName(_inputName!)),
            icon: const Icon(Icons.download),
            label: const Text('Download repaired PDF'),
            style: OutlinedButton.styleFrom(
              padding:
                  const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
            ),
          ),
      ],
    );
  }

  Widget _buildHowItWorks() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surfaceMutedLight,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderLight),
      ),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'How it works',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppColors.textLight,
            ),
          ),
          SizedBox(height: 8),
          Text(
            '• A damaged PDF usually has a broken cross-reference table '
            '(the file\'s "table of contents").\n'
            '• We parse the entire PDF and write a brand-new, valid one.\n'
            '• Your visible content is unchanged — only the structure is '
            'rebuilt.\n'
            '• If the content stream itself is corrupt (rare), we can\'t '
            'recover it. Try opening the original in Adobe Acrobat for '
            'deep recovery.',
            style: TextStyle(
              fontSize: 14,
              color: AppColors.textMutedLight,
              height: 1.6,
            ),
          ),
        ],
      ),
    );
  }
}

String _formatBytes(int bytes) {
  if (bytes < 1024) return '$bytes B';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
  return '${(bytes / 1024 / 1024).toStringAsFixed(1)} MB';
}
