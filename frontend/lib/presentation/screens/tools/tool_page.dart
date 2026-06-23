import 'dart:async';

import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api_client.dart';
import '../../../core/theme.dart';
import '../../../core/tools/tool_registry.dart';

/// Generic, reusable tool page. One widget handles every tool whose
/// backend `task_type` is implemented — it reads everything it needs
/// (upload rules, task type, title, icon, color) from [ToolConfig].
///
/// Tools without a backend `task_type` are NOT rendered here; they go to
/// [ComingSoonToolPage] instead so the user lands on a unique page
/// specific to that tool (not the merge/convert fallback).
class ToolPage extends ConsumerStatefulWidget {
  final ToolConfig tool;

  /// Optional default watermark text (only used when tool.id == 'watermark').
  /// Kept as a constructor arg so the page can be re-used in the future for
  /// custom-watermark flows.
  final String defaultWatermarkText;

  const ToolPage({
    super.key,
    required this.tool,
    this.defaultWatermarkText = 'ProPDFs',
  });

  @override
  ConsumerState<ToolPage> createState() => _ToolPageState();
}

class _ToolPageState extends ConsumerState<ToolPage> {
  final List<_PickedFile> _selectedFiles = [];
  bool _isUploading = false;
  bool _isPolling = false;
  _TaskStatus? _taskStatus;
  Timer? _pollTimer;

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  ToolConfig get _tool => widget.tool;

  /// File extensions the file picker will offer, based on the tool's
  /// [ToolConfig.acceptMode].
  List<String> get _allowedExtensions {
    switch (_tool.acceptMode) {
      case ToolAcceptMode.imageToPdf:
        return const ['jpg', 'jpeg', 'png', 'webp'];
      case ToolAcceptMode.htmlOrPdf:
        return const ['html', 'htm', 'pdf'];
      case ToolAcceptMode.singlePdf:
      case ToolAcceptMode.multiplePdf:
        return const ['pdf'];
    }
  }

  bool get _acceptsMultiple {
    switch (_tool.acceptMode) {
      case ToolAcceptMode.multiplePdf:
      case ToolAcceptMode.imageToPdf:
        return true;
      case ToolAcceptMode.singlePdf:
      case ToolAcceptMode.htmlOrPdf:
        return false;
    }
  }

  String get _pickHint {
    switch (_tool.acceptMode) {
      case ToolAcceptMode.multiplePdf:
        return 'Pick at least 2 PDF files to ${_tool.title.toLowerCase()}';
      case ToolAcceptMode.imageToPdf:
        return 'Pick one or more JPG / PNG images';
      case ToolAcceptMode.htmlOrPdf:
        return 'Pick an .html file or paste a URL (coming soon)';
      case ToolAcceptMode.singlePdf:
        return 'Pick a PDF up to 500MB';
    }
  }

  Future<void> _pickFiles() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: _allowedExtensions,
      allowMultiple: _acceptsMultiple,
      withData: true,
    );
    if (result == null) return;

    setState(() {
      for (final f in result.files) {
        if (f.bytes == null) continue;
        _selectedFiles.add(_PickedFile(
          name: f.name,
          size: f.size,
          bytes: f.bytes!,
        ));
      }
    });
  }

  void _removeFile(int index) {
    setState(() => _selectedFiles.removeAt(index));
  }

  Future<String?> _uploadSingle(_PickedFile f) async {
    final dio = ref.read(apiClientProvider);
    final form = FormData.fromMap({
      'file': MultipartFile.fromBytes(
        f.bytes,
        filename: f.name,
        contentType: _mediaTypeFor(f.name),
      ),
    });
    final resp = await dio.post('/api/v1/documents/upload', data: form);
    return resp.data['id'] as String;
  }

  /// Pick a sane MIME type for the upload — the backend accepts any
  /// application/pdf, image/*, or text/html based on the tool, but we
  /// pass the right one so storage / Sentry breadcrumbs are accurate.
  DioMediaType _mediaTypeFor(String filename) {
    final lower = filename.toLowerCase();
    if (lower.endsWith('.pdf')) {
      return DioMediaType('application', 'pdf');
    }
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
      return DioMediaType('image', 'jpeg');
    }
    if (lower.endsWith('.png')) {
      return DioMediaType('image', 'png');
    }
    if (lower.endsWith('.webp')) {
      return DioMediaType('image', 'webp');
    }
    if (lower.endsWith('.html') || lower.endsWith('.htm')) {
      return DioMediaType('text', 'html');
    }
    return DioMediaType('application', 'octet-stream');
  }

  Future<void> _processFiles() async {
    if (_selectedFiles.isEmpty) return;
    setState(() {
      _isUploading = true;
      _taskStatus = null;
    });

    try {
      final dio = ref.read(apiClientProvider);

      // Upload every file. Track ids so we can queue the processing task.
      final docIds = <String>[];
      for (var i = 0; i < _selectedFiles.length; i++) {
        final id = await _uploadSingle(_selectedFiles[i]);
        if (id != null) docIds.add(id);
      }

      if (docIds.isEmpty) {
        throw Exception('Upload failed for all files');
      }

      // Queue the processing task. Tool must have a backend task_type —
      // for tools without one, [ComingSoonToolPage] is rendered instead.
      final taskType = _tool.taskType!;
      final params = _tool.id == 'watermark'
          ? <String, dynamic>{'text': widget.defaultWatermarkText}
          : <String, dynamic>{};

      final queueResp = await dio.post('/api/v1/process/', data: {
        'input_document_ids': docIds,
        'task_type': taskType,
        'params': params,
      });

      final taskId = queueResp.data['id'] as String;
      setState(() {
        _taskStatus = _TaskStatus(
          id: taskId,
          status: queueResp.data['status'] as String? ?? 'pending',
          resultUrl: null,
        );
        _isUploading = false;
        _isPolling = true;
      });

      _startPolling(taskId);
    } on DioException catch (e) {
      _showError(e.response?.data?['detail'] ?? e.message ?? 'Upload failed');
      setState(() {
        _isUploading = false;
        _isPolling = false;
      });
    } catch (e) {
      _showError(e.toString());
      setState(() {
        _isUploading = false;
        _isPolling = false;
      });
    }
  }

  void _startPolling(String taskId) {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 2), (timer) async {
      try {
        final dio = ref.read(apiClientProvider);
        final resp = await dio.get('/api/v1/process/$taskId');
        final status = resp.data['status'] as String? ?? 'pending';
        final resultUrl = resp.data['result_url'] as String?;

        if (!mounted) {
          timer.cancel();
          return;
        }

        setState(() {
          _taskStatus = _TaskStatus(
            id: taskId,
            status: status,
            resultUrl: resultUrl,
          );
        });

        if (status == 'completed' || status == 'failed') {
          timer.cancel();
          setState(() => _isPolling = false);
        }
      } catch (_) {
        // Transient network error — keep polling.
      }
    });
  }

  void _showError(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: Colors.red),
    );
  }

  void _cancelTask() {
    _pollTimer?.cancel();
    setState(() {
      _isPolling = false;
      _taskStatus = null;
    });
  }

  String _formatBytes(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / 1024 / 1024).toStringAsFixed(1)} MB';
  }

  @override
  Widget build(BuildContext context) {
    final canProcess = _selectedFiles.isNotEmpty &&
        (_acceptsMultiple || _selectedFiles.length == 1) &&
        !_isUploading &&
        !_isPolling;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          // Use go() so back goes to /home (which is the catalog), not
          // the previous /tools/<id>.
          onPressed: () => context.go('/tools'),
        ),
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: _tool.color.withOpacity(0.12),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(_tool.icon, size: 18, color: _tool.color),
            ),
            const SizedBox(width: 10),
            Text(_tool.title),
          ],
        ),
      ),
      body: Column(
        children: [
          // Tool header — title, description, color stripe
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(24, 24, 24, 24),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  _tool.color.withOpacity(0.08),
                  AppColors.surfaceLight,
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              border: Border(
                bottom: BorderSide(color: AppColors.borderLight, width: 1),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _tool.longDescription ?? _tool.description,
                  style: const TextStyle(
                    fontSize: 15,
                    color: AppColors.textMutedLight,
                    height: 1.5,
                  ),
                ),
              ],
            ),
          ),

          // File upload area
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  InkWell(
                    onTap: _pickFiles,
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(32),
                      decoration: BoxDecoration(
                        border: Border.all(
                          color: Theme.of(context).colorScheme.outline.withOpacity(0.5),
                          style: BorderStyle.solid,
                        ),
                        borderRadius: BorderRadius.circular(16),
                        color: Theme.of(context).colorScheme.surfaceContainerHighest.withOpacity(0.5),
                      ),
                      child: Column(
                        children: [
                          Icon(
                            Icons.cloud_upload_outlined,
                            size: 48,
                            color: _tool.color,
                          ),
                          const SizedBox(height: 12),
                          Text(
                            'Tap to upload files',
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            _pickHint,
                            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: Colors.grey[500],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  if (_selectedFiles.isNotEmpty)
                    Expanded(
                      child: ListView.builder(
                        itemCount: _selectedFiles.length,
                        itemBuilder: (context, index) {
                          final f = _selectedFiles[index];
                          return Card(
                            child: ListTile(
                              leading: Icon(_tool.icon, color: _tool.color),
                              title: Text(f.name, overflow: TextOverflow.ellipsis),
                              subtitle: Text(_formatBytes(f.size)),
                              trailing: IconButton(
                                icon: const Icon(Icons.close),
                                onPressed: () => _removeFile(index),
                              ),
                            ),
                          );
                        },
                      ),
                    )
                  else
                    const Expanded(
                      child: Center(
                        child: Text(
                          'No files selected',
                          style: TextStyle(color: Colors.grey),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),

          // Task status panel
          if (_taskStatus != null) _buildTaskStatusPanel(),

          // Process button
          Padding(
            padding: const EdgeInsets.all(16),
            child: SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: canProcess ? _processFiles : null,
                icon: _isUploading
                    ? const SizedBox(
                        height: 18,
                        width: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : Icon(_tool.icon),
                label: Text(_isUploading
                    ? 'Uploading...'
                    : _isPolling
                        ? 'Processing...'
                        : _tool.title),
                style: FilledButton.styleFrom(
                  backgroundColor: _tool.color,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  textStyle: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTaskStatusPanel() {
    final s = _taskStatus!;
    final isCompleted = s.status == 'completed';
    final isFailed = s.status == 'failed';

    Color bgColor;
    IconData icon;
    if (isCompleted) {
      bgColor = Colors.green.shade50;
      icon = Icons.check_circle;
    } else if (isFailed) {
      bgColor = Colors.red.shade50;
      icon = Icons.error;
    } else {
      bgColor = Colors.blue.shade50;
      icon = Icons.hourglass_top;
    }

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (!isCompleted && !isFailed)
                const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              else
                Icon(icon, color: isCompleted ? Colors.green : Colors.red),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Task ${s.status}',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
              if (_isPolling)
                TextButton(onPressed: _cancelTask, child: const Text('Cancel')),
            ],
          ),
          if (isCompleted && s.resultUrl != null) ...[
            const SizedBox(height: 8),
            FilledButton.icon(
              onPressed: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text('Download: ${s.resultUrl}'),
                    duration: const Duration(seconds: 8),
                  ),
                );
              },
              icon: const Icon(Icons.download),
              label: const Text('Download result'),
            ),
          ],
        ],
      ),
    );
  }
}

class _PickedFile {
  final String name;
  final int size;
  final List<int> bytes;

  _PickedFile({required this.name, required this.size, required this.bytes});
}

class _TaskStatus {
  final String id;
  final String status;
  final String? resultUrl;

  _TaskStatus({required this.id, required this.status, this.resultUrl});
}
