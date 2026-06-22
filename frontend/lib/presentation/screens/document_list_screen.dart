import 'dart:async';

import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../providers/auth_provider.dart';
import '../widgets/app_footer.dart';

class DocumentListScreen extends ConsumerStatefulWidget {
  const DocumentListScreen({super.key});

  @override
  ConsumerState<DocumentListScreen> createState() => _DocumentListScreenState();
}

class _DocumentListScreenState extends ConsumerState<DocumentListScreen> {
  bool _isLoading = true;
  bool _isUploading = false;
  String? _error;
  List<_Doc> _docs = [];
  int _total = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final dio = ref.read(apiClientProvider);
      final resp = await dio.get('/api/v1/documents/', queryParameters: {
        'page': 1,
        'page_size': 50,
      });
      final items = (resp.data['items'] as List<dynamic>? ?? const [])
          .cast<Map<String, dynamic>>();
      if (!mounted) return;
      setState(() {
        _docs = items
            .map((j) => _Doc(
                  id: j['id'] as String,
                  filename: j['filename'] as String? ?? 'untitled',
                  mimeType: j['mime_type'] as String? ?? '',
                  fileSize: (j['file_size'] as num?)?.toInt() ?? 0,
                  pageCount: (j['page_count'] as num?)?.toInt(),
                  createdAt: DateTime.tryParse(j['created_at'] as String? ?? '') ??
                      DateTime.now(),
                  status: j['status'] as String? ?? 'completed',
                ))
            .toList();
        _total = (resp.data['total'] as num?)?.toInt() ?? _docs.length;
        _isLoading = false;
      });
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.response?.data?['detail'] ?? e.message ?? 'Failed to load';
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

  Future<void> _upload() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['pdf', 'png', 'jpg', 'jpeg', 'webp'],
      withData: true,
    );
    if (result == null || result.files.single.bytes == null) return;

    setState(() => _isUploading = true);
    try {
      final dio = ref.read(apiClientProvider);
      final form = FormData.fromMap({
        'file': MultipartFile.fromBytes(
          result.files.single.bytes!,
          filename: result.files.single.name,
          contentType: DioMediaType('application', 'pdf'),
        ),
      });
      await dio.post('/api/v1/documents/upload', data: form);
      await _load();
    } on DioException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.response?.data?['detail'] ?? 'Upload failed'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isUploading = false);
    }
  }

  Future<void> _delete(_Doc d) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete document?'),
        content: Text('"${d.filename}" will be permanently deleted.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    try {
      final dio = ref.read(apiClientProvider);
      await dio.delete('/api/v1/documents/${d.id}');
      await _load();
    } on DioException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.response?.data?['detail'] ?? 'Delete failed'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _download(_Doc d) async {
    try {
      final dio = ref.read(apiClientProvider);
      final resp = await dio.get('/api/v1/documents/${d.id}/download');
      final url = resp.data['download_url'] as String?;
      if (url != null && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Download: $url'),
            duration: const Duration(seconds: 8),
          ),
        );
      }
    } on DioException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.response?.data?['detail'] ?? 'Download failed'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  String _formatBytes(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / 1024 / 1024).toStringAsFixed(1)} MB';
  }

  IconData _iconForMime(String mime) {
    if (mime.contains('pdf')) return Icons.picture_as_pdf;
    if (mime.startsWith('image/')) return Icons.image;
    return Icons.insert_drive_file;
  }

  Color _colorForMime(String mime) {
    if (mime.contains('pdf')) return Colors.red;
    if (mime.startsWith('image/')) return Colors.blue;
    return Colors.grey;
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authStateProvider).value;
    if (auth?.user == null) {
      // Auth guard will redirect, but render an empty scaffold in the meantime.
      return Scaffold(
        appBar: AppBar(title: const Text('My Documents')),
        bottomNavigationBar: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(color: const Color(0xFF0a0a0f), height: 1),
          const AppFooter(),
        ],
      ),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text('My Documents ($_total)'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _isLoading ? null : _load,
          ),
        ],
      ),
      bottomNavigationBar: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(color: const Color(0xFF0a0a0f), height: 1),
          const AppFooter(),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.error_outline,
                          color: Colors.red, size: 48),
                      const SizedBox(height: 8),
                      Text(_error!),
                      const SizedBox(height: 16),
                      FilledButton(onPressed: _load, child: const Text('Retry')),
                    ],
                  ),
                )
              : _docs.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.folder_open,
                              size: 64, color: Colors.grey[300]),
                          const SizedBox(height: 8),
                          const Text('No documents yet'),
                          const SizedBox(height: 16),
                          FilledButton.icon(
                            onPressed: _isUploading ? null : _upload,
                            icon: const Icon(Icons.upload),
                            label: const Text('Upload your first PDF'),
                          ),
                        ],
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _docs.length,
                        itemBuilder: (context, index) {
                          final d = _docs[index];
                          return Card(
                            margin: const EdgeInsets.only(bottom: 8),
                            child: ListTile(
                              leading: CircleAvatar(
                                backgroundColor: _colorForMime(d.mimeType)
                                    .withOpacity(0.1),
                                child: Icon(
                                  _iconForMime(d.mimeType),
                                  color: _colorForMime(d.mimeType),
                                ),
                              ),
                              title: Text(d.filename,
                                  overflow: TextOverflow.ellipsis),
                              subtitle: Text(
                                '${_formatBytes(d.fileSize)}'
                                '${d.pageCount != null ? ' • ${d.pageCount} pages' : ''}'
                                ' • ${d.createdAt.toLocal().toString().split(' ').first}',
                                style: TextStyle(color: Colors.grey[500]),
                              ),
                              trailing: PopupMenuButton<String>(
                                onSelected: (value) {
                                  if (value == 'download') _download(d);
                                  if (value == 'delete') _delete(d);
                                },
                                itemBuilder: (context) => [
                                  const PopupMenuItem(
                                    value: 'download',
                                    child: Row(
                                      children: [
                                        Icon(Icons.download, size: 18),
                                        SizedBox(width: 8),
                                        Text('Download'),
                                      ],
                                    ),
                                  ),
                                  const PopupMenuItem(
                                    value: 'delete',
                                    child: Row(
                                      children: [
                                        Icon(Icons.delete,
                                            size: 18, color: Colors.red),
                                        SizedBox(width: 8),
                                        Text('Delete',
                                            style:
                                                TextStyle(color: Colors.red)),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                              onTap: () => _download(d),
                            ),
                          );
                        },
                      ),
                    ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _isUploading ? null : _upload,
        icon: _isUploading
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                    strokeWidth: 2, color: Colors.white))
            : const Icon(Icons.add),
        label: const Text('Upload'),
      ),
    );
  }
}

class _Doc {
  final String id;
  final String filename;
  final String mimeType;
  final int fileSize;
  final int? pageCount;
  final DateTime createdAt;
  final String status;

  _Doc({
    required this.id,
    required this.filename,
    required this.mimeType,
    required this.fileSize,
    required this.createdAt,
    required this.status,
    this.pageCount,
  });
}
