import 'dart:async';

import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api_client.dart';
import '../theme.dart';
import 'web_bridge.dart';

/// Small wrapper around the upload → process → poll → download
/// pipeline used by the dedicated tool pages (crop / protect / unlock
/// today, AI tools tomorrow). Each tool page handles its own form
/// state; this service just owns the backend dance so the page widgets
/// stay focused on UX.
class ToolProcessService {
  /// MIME type helper — lifted from tool_page.dart so the dedicated
  /// pages don't need to duplicate the lookup.
  static DioMediaType _mediaTypeFor(String filename) {
    final lower = filename.toLowerCase();
    if (lower.endsWith('.pdf')) return DioMediaType('application', 'pdf');
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
      return DioMediaType('image', 'jpeg');
    }
    if (lower.endsWith('.png')) return DioMediaType('image', 'png');
    if (lower.endsWith('.webp')) return DioMediaType('image', 'webp');
    if (lower.endsWith('.html') || lower.endsWith('.htm')) {
      return DioMediaType('text', 'html');
    }
    return DioMediaType('application', 'octet-stream');
  }

  /// Upload a single file to /api/v1/documents/upload. Returns the
  /// created document id, or null if the upload failed.
  static Future<String?> uploadFile(
    WidgetRef ref, {
    required Uint8List bytes,
    required String filename,
  }) async {
    final dio = ref.read(apiClientProvider);
    final form = FormData.fromMap({
      'file': MultipartFile.fromBytes(
        bytes,
        filename: filename,
        contentType: _mediaTypeFor(filename),
      ),
    });
    final resp = await dio.post('/api/v1/documents/upload', data: form);
    return resp.data['id'] as String?;
  }

  /// Queue a processing task. The task runs async on Celery; the
  /// returned taskId is used to poll status.
  static Future<String> queueTask(
    WidgetRef ref, {
    required String documentId,
    required String taskType,
    required Map<String, dynamic> params,
  }) async {
    final dio = ref.read(apiClientProvider);
    final resp = await dio.post('/api/v1/process/', data: {
      'input_document_ids': [documentId],
      'task_type': taskType,
      'params': params,
    });
    return resp.data['id'] as String;
  }

  /// Poll the task status endpoint until the task reaches a terminal
  /// state (completed / failed) or the timeout elapses. Returns the
  /// final [ProcessingResult]. Callers are responsible for surfacing
  /// the error string to the user.
  static Future<ProcessingResult> pollUntilDone(
    WidgetRef ref, {
    required String taskId,
    Duration timeout = const Duration(minutes: 5),
  }) async {
    final dio = ref.read(apiClientProvider);
    final deadline = DateTime.now().add(timeout);
    ProcessingResult? last;
    while (DateTime.now().isBefore(deadline)) {
      final resp = await dio.get('/api/v1/process/$taskId');
      final data = resp.data as Map<String, dynamic>;
      last = ProcessingResult.fromJson(data);
      if (last.isTerminal) return last;
      await Future<void>.delayed(const Duration(seconds: 1));
    }
    return last ??
        const ProcessingResult(
          id: 'unknown',
          taskType: 'unknown',
          status: 'failed',
          error: 'Polling timed out before the task completed.',
        );
  }

  /// Download the result file from a `/api/v1/documents/{id}/download`
  /// URL. The URL is what the backend stores in `result_url` once the
  /// task succeeds.
  static Future<Uint8List> downloadResult(
    WidgetRef ref,
    String url,
  ) async {
    final dio = ref.read(apiClientProvider);
    final resp = await dio.get<List<int>>(
      url,
      options: Options(responseType: ResponseType.bytes),
    );
    return Uint8List.fromList(resp.data ?? const []);
  }

  /// Pick a single PDF using the platform file picker. Returns null
  /// if the user cancelled.
  static Future<PlatformFile?> pickPdf() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['pdf'],
      withData: true,
    );
    if (result == null || result.files.isEmpty) return null;
    return result.files.first;
  }

  /// Browser-side download shim. Mirrors the pattern in repair_pdf_page.
  static void webDownload(Uint8List bytes, String filename) {
    WebBridge.downloadBytes(bytes, filename, mimeType: 'application/pdf');
  }

  /// Theme accent pulled from [AppColors] for tool-coloured CTAs.
  static const Color accent = AppColors.primary;
}

/// Polled task state.
@immutable
class ProcessingResult {
  final String id;
  final String taskType;
  final String status; // pending | processing | completed | failed
  final String? resultUrl;
  final String? error;

  const ProcessingResult({
    required this.id,
    required this.taskType,
    required this.status,
    this.resultUrl,
    this.error,
  });

  factory ProcessingResult.fromJson(Map<String, dynamic> json) {
    return ProcessingResult(
      id: (json['id'] ?? 'unknown').toString(),
      taskType: (json['task_type'] ?? 'unknown').toString(),
      status: (json['status'] ?? 'pending').toString(),
      resultUrl: json['result_url'] as String?,
      error: json['error'] as String?,
    );
  }

  bool get isCompleted => status == 'completed';
  bool get isFailed => status == 'failed';
  bool get isTerminal => isCompleted || isFailed;
}
