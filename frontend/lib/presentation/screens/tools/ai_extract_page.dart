import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/theme.dart';
import '../../widgets/ai_tool_scaffold.dart';

/// AI Extract Data — picks an extraction type, then POSTs to
/// /api/v1/ai/extract. The response is JSON shaped per the
/// extraction_type chosen, displayed as pretty-printed JSON.
class AiExtractPage extends ConsumerStatefulWidget {
  const AiExtractPage({super.key});

  @override
  ConsumerState<AiExtractPage> createState() => _AiExtractPageState();
}

class _AiExtractPageState extends ConsumerState<AiExtractPage> {
  String _type = 'entities';

  static const _types = <_ExtractionTypeOption>[
    _ExtractionTypeOption(
      value: 'entities',
      label: 'Named entities',
      description: 'People, organisations, locations, dates',
      icon: Icons.person_outline,
    ),
    _ExtractionTypeOption(
      value: 'key_data',
      label: 'Key data points',
      description: 'Stats, figures, facts',
      icon: Icons.bar_chart,
    ),
    _ExtractionTypeOption(
      value: 'tables',
      label: 'Tables',
      description: 'Markdown-formatted table data',
      icon: Icons.table_chart_outlined,
    ),
    _ExtractionTypeOption(
      value: 'contacts',
      label: 'Contact info',
      description: 'Emails, phones, addresses',
      icon: Icons.contact_page_outlined,
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return AiToolScaffold(
      accent: AppColors.catAi,
      title: 'AI Extract Data',
      heroIcon: Icons.data_object,
      ctaLabel: 'Extract',
      busyLabel: 'Extracting...',
      ctaHint:
          'Gemini reads the document and returns structured data in the '
          'shape you pick. Best for invoices, contracts, and any '
          'document with a clear schema in mind.',
      extraForm: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surfaceMutedLight,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.borderLight),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'What to extract',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: AppColors.textLight,
              ),
            ),
            const SizedBox(height: 12),
            for (final t in _types)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _TypeRadio(
                  option: t,
                  selected: _type == t.value,
                  onTap: () => setState(() => _type = t.value),
                ),
              ),
          ],
        ),
      ),
      submit: (
          {required Uint8List bytes,
          required String filename,
          required Map<String, dynamic> formValues}) async {
        final dio = ref.read(apiClientProvider);
        final form = FormData.fromMap({
          'file': MultipartFile.fromBytes(
            bytes,
            filename: filename,
            contentType: DioMediaType('application', 'pdf'),
          ),
          'extraction_type': _type,
        });
        final resp = await dio.post('/api/v1/ai/extract', data: form);
        return resp.data as Map<String, dynamic>;
      },
      buildResult: (context, response) {
        // The backend returns a JSON-ish blob inside a single
        // string field. We try to pretty-print it; if parsing
        // fails, fall back to plain text.
        final raw = response['result'] as String? ??
            response['extracted_data'] as String? ??
            response['data'] as String? ??
            '';
        if (raw.isEmpty) {
          return const _NoResult(
            message:
                'The model returned an empty result. Try a different '
                'document or extraction type.',
          );
        }
        String body;
        try {
          // Some responses are JSON objects, some are markdown
          // tables (for the "tables" type). We try JSON first
          // and fall back to the raw string.
          final asJson = jsonDecode(raw);
          body = const JsonEncoder.withIndent('  ').convert(asJson);
        } catch (_) {
          body = raw;
        }
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
                  const Icon(Icons.data_object,
                      color: AppColors.catAi, size: 20),
                  const SizedBox(width: 8),
                  Text(
                    'Extracted ($_type)',
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: AppColors.catAi,
                    ),
                  ),
                  const Spacer(),
                  TextButton.icon(
                    onPressed: () =>
                        Clipboard.setData(ClipboardData(text: body)),
                    icon: const Icon(Icons.copy, size: 18),
                    label: const Text('Copy'),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.surfaceMutedLight,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: SelectableText(
                  body,
                  style: const TextStyle(
                    fontSize: 13,
                    fontFamily: 'monospace',
                    color: AppColors.textLight,
                    height: 1.5,
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _TypeRadio extends StatelessWidget {
  final _ExtractionTypeOption option;
  final bool selected;
  final VoidCallback onTap;

  const _TypeRadio({
    required this.option,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: selected
              ? AppColors.catAi.withOpacity(0.08)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: selected
                ? AppColors.catAi
                : AppColors.borderLight,
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Row(
          children: [
            Icon(option.icon,
                color: selected
                    ? AppColors.catAi
                    : AppColors.textMutedLight,
                size: 20),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    option.label,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: selected
                          ? AppColors.catAi
                          : AppColors.textLight,
                    ),
                  ),
                  Text(
                    option.description,
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textMutedLight,
                    ),
                  ),
                ],
              ),
            ),
            if (selected)
              const Icon(Icons.check_circle,
                  color: AppColors.catAi, size: 18),
          ],
        ),
      ),
    );
  }
}

class _ExtractionTypeOption {
  final String value;
  final String label;
  final String description;
  final IconData icon;
  const _ExtractionTypeOption({
    required this.value,
    required this.label,
    required this.description,
    required this.icon,
  });
}

class _NoResult extends StatelessWidget {
  final String message;
  const _NoResult({required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surfaceMutedLight,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.borderLight),
      ),
      child: Text(
        message,
        style: const TextStyle(
          fontSize: 14,
          color: AppColors.textMutedLight,
        ),
      ),
    );
  }
}
