import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/services/web_bridge.dart';
import '../../../core/theme.dart';

/// AI Fill Forms — two-step flow with the backend:
///
///   1. POST /api/v1/ai/fill-forms  (file=<pdf>) → suggestions
///      The page renders every AcroForm field as an editable row
///      so the user can correct anything Gemini got wrong
///      before committing.
///   2. POST /api/v1/ai/fill-forms/apply (file=<pdf>,
///      fields=<json>) → the filled PDF as a download.
///
/// Always two-step: we never want to silently trust the model
/// for a form someone's about to sign.
class AiFillFormsPage extends ConsumerStatefulWidget {
  const AiFillFormsPage({super.key});

  @override
  ConsumerState<AiFillFormsPage> createState() => _AiFillFormsPageState();
}

class _AiFillFormsPageState extends ConsumerState<AiFillFormsPage> {
  Uint8List? _inputBytes;
  String? _inputName;
  bool _busy = false;
  String? _error;
  List<_FillFormField> _fields = const [];
  Map<String, TextEditingController> _controllers = {};
  String? _reason; // e.g. "No AcroForm fields found"
  int? _contextChars;
  bool _downloadReady = false;

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _pickFile() async {
    setState(() {
      _error = null;
      _fields = const [];
      _reason = null;
      _downloadReady = false;
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
    });
  }

  Future<void> _suggest() async {
    if (_inputBytes == null || _inputName == null) return;
    setState(() {
      _busy = true;
      _error = null;
      _fields = const [];
    });
    try {
      final dio = ref.read(apiClientProvider);
      final form = FormData.fromMap({
        'file': MultipartFile.fromBytes(
          _inputBytes!,
          filename: _inputName!,
          contentType: DioMediaType('application', 'pdf'),
        ),
      });
      final resp = await dio.post('/api/v1/ai/fill-forms', data: form);
      final data = resp.data as Map<String, dynamic>;
      final rawFields = (data['fields'] as List?) ?? const [];
      _disposeControllers();
      final newFields = rawFields
          .whereType<Map>()
          .map((m) => _FillFormField.fromJson(m.cast<String, dynamic>()))
          .toList();
      _controllers = {
        for (final f in newFields) f.name: TextEditingController(text: f.value),
      };
      if (!mounted) return;
      setState(() {
        _fields = newFields;
        _reason = data['reason'] as String?;
        _contextChars = data['context_chars'] as int?;
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

  Future<void> _apply() async {
    if (_inputBytes == null || _inputName == null) return;
    if (_fields.isEmpty) return;
    setState(() {
      _busy = true;
      _error = null;
      _downloadReady = false;
    });
    try {
      // Build the values map from the current controller text.
      final values = <String, String>{};
      for (final f in _fields) {
        final c = _controllers[f.name];
        if (c != null) values[f.name] = c.text;
      }
      final dio = ref.read(apiClientProvider);
      final form = FormData.fromMap({
        'file': MultipartFile.fromBytes(
          _inputBytes!,
          filename: _inputName!,
          contentType: DioMediaType('application', 'pdf'),
        ),
        'fields': values,
      });
      final resp = await dio.post(
        '/api/v1/ai/fill-forms/apply',
        data: form,
        options: Options(responseType: ResponseType.bytes),
      );
      final bytes = Uint8List.fromList(resp.data as List<int>);
      if (!mounted) return;
      // Trigger browser download.
      WebBridge.downloadBytes(
        bytes,
        _suggestOutputName(_inputName!),
        mimeType: 'application/pdf',
      );
      setState(() {
        _downloadReady = true;
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

  String _suggestOutputName(String original) {
    final dot = original.lastIndexOf('.');
    final stem = dot < 0 ? original : original.substring(0, dot);
    return '$stem-filled.pdf';
  }

  void _disposeControllers() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    _controllers = {};
  }

  String _humaniseError(Object e) {
    final s = e.toString();
    if (e is DioException) {
      final code = e.response?.statusCode;
      final detail = e.response?.data is Map
          ? (e.response!.data as Map)['detail']?.toString()
          : null;
      if (code == 401) return 'You need to sign in to use AI tools.';
      if (detail != null) return detail;
    }
    if (s.contains('Connection') || s.contains('SocketException')) {
      return 'Network error — check your connection and try again.';
    }
    return s;
  }

  @override
  Widget build(BuildContext context) {
    final hasFile = _inputBytes != null;
    final hasFields = _fields.isNotEmpty;
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
                color: AppColors.catAi.withOpacity(0.12),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(
                Icons.assignment_turned_in,
                size: 18,
                color: AppColors.catAi,
              ),
            ),
            const SizedBox(width: 10),
            const Text('AI Fill Forms'),
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
                if (_reason != null) _buildReasonBanner(_reason!),
                if (hasFields) ...[
                  const SizedBox(height: 16),
                  _buildFieldsList(),
                ],
                const SizedBox(height: 16),
                _buildActions(hasFile, hasFields),
                if (_downloadReady) ...[
                  const SizedBox(height: 16),
                  _buildDownloadBanner(),
                ],
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
            color: AppColors.catAi.withOpacity(0.10),
            borderRadius: BorderRadius.circular(20),
          ),
          child: const Icon(
            Icons.assignment_turned_in,
            size: 40,
            color: AppColors.catAi,
          ),
        ),
        const SizedBox(height: 16),
        const Text(
          'AI Fill Forms',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.w800,
            color: AppColors.textLight,
            letterSpacing: -0.5,
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'Two-step flow: suggest → review → commit. You always see '
          'what Gemini wants to fill in before any value is written '
          'to the PDF.',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 14,
            color: AppColors.textMutedLight,
            height: 1.5,
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
            color: hasFile ? AppColors.catAi : Colors.grey[400]!,
            width: hasFile ? 2 : 1.5,
          ),
          borderRadius: BorderRadius.circular(16),
          color: hasFile
              ? AppColors.catAi.withOpacity(0.04)
              : AppColors.surfaceMutedLight,
        ),
        child: Row(
          children: [
            Icon(
              hasFile ? Icons.check_circle : Icons.upload_file,
              size: 32,
              color: hasFile ? AppColors.catAi : Colors.grey[600],
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                hasFile ? _inputName! : 'Choose a PDF with form fields',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: hasFile
                      ? AppColors.textLight
                      : AppColors.textMutedLight,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (hasFile)
              IconButton(
                icon: const Icon(Icons.close, size: 20),
                onPressed: _busy ? null : _pickFile,
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
            const Icon(Icons.error_outline,
                color: AppColors.danger, size: 22),
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

  Widget _buildReasonBanner(String reason) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.warning.withOpacity(0.06),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.warning.withOpacity(0.30)),
        ),
        child: Row(
          children: [
            const Icon(Icons.info_outline,
                color: AppColors.warning, size: 22),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                reason,
                style: const TextStyle(
                  fontSize: 14,
                  color: AppColors.textLight,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFieldsList() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.catAi.withOpacity(0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.assignment, color: AppColors.catAi, size: 20),
              const SizedBox(width: 8),
              Text(
                '${_fields.length} field${_fields.length == 1 ? '' : 's'} found',
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppColors.catAi,
                ),
              ),
              const Spacer(),
              if (_contextChars != null)
                Text(
                  'context: $_contextChars chars',
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppColors.textMutedLight,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 4),
          const Text(
            'Review the suggested values, edit anything that looks '
            'wrong, then hit "Apply & Download".',
            style: TextStyle(fontSize: 12, color: AppColors.textMutedLight),
          ),
          const SizedBox(height: 16),
          for (final f in _fields) _buildFieldRow(f),
        ],
      ),
    );
  }

  Widget _buildFieldRow(_FillFormField f) {
    final controller = _controllers[f.name]!;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  f.name,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textLight,
                  ),
                ),
              ),
              if (f.page != null)
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceMutedLight,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    'p${f.page}',
                    style: const TextStyle(
                      fontSize: 10,
                      color: AppColors.textMutedLight,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 4),
          TextField(
            controller: controller,
            decoration: InputDecoration(
              isDense: true,
              hintText: f.value.isEmpty ? '(empty)' : null,
              filled: true,
              fillColor: AppColors.surfaceMutedLight,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: BorderSide(color: AppColors.borderLight),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: BorderSide(color: AppColors.borderLight),
              ),
            ),
            style: const TextStyle(fontSize: 13, color: AppColors.textLight),
          ),
        ],
      ),
    );
  }

  Widget _buildActions(bool hasFile, bool hasFields) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          height: 52,
          child: FilledButton.icon(
            onPressed: (hasFile && !_busy) ? _suggest : null,
            icon: _busy
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Icon(Icons.auto_awesome, size: 20),
            label: Text(
              hasFields ? 'Re-suggest values' : 'Suggest values',
            ),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.catAi,
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
        if (hasFields) ...[
          const SizedBox(height: 12),
          SizedBox(
            height: 52,
            child: FilledButton.icon(
              onPressed: _busy ? null : _apply,
              icon: const Icon(Icons.download, size: 20),
              label: const Text('Apply & Download filled PDF'),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primary,
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
        ],
      ],
    );
  }

  Widget _buildDownloadBanner() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.primary.withOpacity(0.06),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.primary.withOpacity(0.30)),
      ),
      child: Row(
        children: const [
          Icon(Icons.check_circle, color: AppColors.primary, size: 22),
          SizedBox(width: 12),
          Expanded(
            child: Text(
              'Filled PDF downloaded. Open it in your viewer to verify '
              'the values landed in the right fields.',
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
}

class _FillFormField {
  final String name;
  final String value;
  final String type;
  final int? page;

  const _FillFormField({
    required this.name,
    required this.value,
    required this.type,
    this.page,
  });

  factory _FillFormField.fromJson(Map<String, dynamic> j) {
    return _FillFormField(
      name: j['name'] as String? ?? '(unnamed)',
      value: j['value'] as String? ?? '',
      type: j['type'] as String? ?? 'Tx',
      page: (j['page'] as num?)?.toInt(),
    );
  }
}
