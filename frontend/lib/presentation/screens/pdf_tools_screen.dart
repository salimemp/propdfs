import 'dart:async';

import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';

/// Tool → task_type that the backend `PDFProcessingService` understands.
/// Keep this in sync with `app/services/celery_tasks.py`.
const Map<String, String> _kTaskTypes = {
  'merge': 'merge',
  'split': 'split',
  'compress': 'compress',
  'rotate': 'rotate',
  'extract': 'extract',
  'watermark': 'watermark',
  'convert': 'convert_to_images',
};

class PdfToolsScreen extends ConsumerStatefulWidget {
  const PdfToolsScreen({super.key});

  @override
  ConsumerState<PdfToolsScreen> createState() => _PdfToolsScreenState();
}

class _PdfToolsScreenState extends ConsumerState<PdfToolsScreen> {
  final List<_PickedFile> _selectedFiles = [];
  String _selectedTool = 'merge';
  bool _isUploading = false;
  bool _isPolling = false;
  _TaskStatus? _taskStatus;
  Timer? _pollTimer;

  final List<Map<String, dynamic>> _tools = const [
    {'id': 'merge', 'name': 'Merge PDFs', 'icon': Icons.merge_type, 'color': Colors.blue, 'multiFile': true},
    {'id': 'split', 'name': 'Split PDF', 'icon': Icons.call_split, 'color': Colors.green, 'multiFile': false},
    {'id': 'compress', 'name': 'Compress', 'icon': Icons.compress, 'color': Colors.orange, 'multiFile': false},
    {'id': 'rotate', 'name': 'Rotate', 'icon': Icons.rotate_right, 'color': Colors.purple, 'multiFile': false},
    {'id': 'extract', 'name': 'Extract Pages', 'icon': Icons.content_cut, 'color': Colors.red, 'multiFile': false},
    {'id': 'watermark', 'name': 'Watermark', 'icon': Icons.water_drop, 'color': Colors.teal, 'multiFile': false},
    {'id': 'convert', 'name': 'Convert to Images', 'icon': Icons.image, 'color': Colors.indigo, 'multiFile': false},
  ];

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _pickFiles() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['pdf'],
      allowMultiple: true,
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
        contentType: DioMediaType('application', 'pdf'),
      ),
    });
    final resp = await dio.post('/api/v1/documents/upload', data: form);
    return resp.data['id'] as String;
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

      // Queue the processing task. Merge needs >=2 files; the backend will
      // validate and 400 otherwise, which we surface as an error.
      final taskType = _kTaskTypes[_selectedTool]!;
      final params = _selectedTool == 'watermark'
          ? {'text': 'ProPDFs'}
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
      } catch (e) {
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
    final currentTool = _tools.firstWhere((t) => t['id'] == _selectedTool);
    final requiresMulti = currentTool['multiFile'] == true;
    final canProcess = _selectedFiles.isNotEmpty &&
        (!requiresMulti || _selectedFiles.length >= 2) &&
        !_isUploading &&
        !_isPolling;

    return Scaffold(
      appBar: AppBar(title: const Text('PDF Tools')),
      body: Column(
        children: [
          // Tool Selector
          Container(
            height: 100,
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: _tools.length,
              itemBuilder: (context, index) {
                final tool = _tools[index];
                final isSelected = _selectedTool == tool['id'];
                return Padding(
                  padding: const EdgeInsets.only(right: 12),
                  child: ChoiceChip(
                    selected: isSelected,
                    onSelected: (_) => setState(() => _selectedTool = tool['id']),
                    avatar: Icon(tool['icon'], size: 18, color: isSelected ? Colors.white : tool['color']),
                    label: Text(tool['name']),
                    selectedColor: tool['color'],
                    labelStyle: TextStyle(
                      color: isSelected ? Colors.white : Colors.black87,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                );
              },
            ),
          ),
          const Divider(),

          // File Upload Area
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
                            color: Theme.of(context).colorScheme.primary,
                          ),
                          const SizedBox(height: 12),
                          Text(
                            'Tap to upload files',
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            requiresMulti
                                ? 'Pick at least 2 PDF files to merge'
                                : 'Pick a PDF up to 500MB',
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
                              leading: const Icon(Icons.picture_as_pdf, color: Colors.red),
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

          // Process Button
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
                    : const Icon(Icons.play_arrow),
                label: Text(_isUploading
                    ? 'Uploading...'
                    : _isPolling
                        ? 'Processing...'
                        : 'Process Files'),
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
