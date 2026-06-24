import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/theme.dart';
import '../../widgets/ai_tool_scaffold.dart';

/// AI Summarize — POSTs the PDF to /api/v1/ai/summarize and
/// renders the response as a markdown text block.
class AiSummarizePage extends ConsumerWidget {
  const AiSummarizePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AiToolScaffold(
      accent: AppColors.catAi,
      title: 'AI Summarize',
      heroIcon: Icons.auto_awesome,
      ctaLabel: 'Summarize',
      busyLabel: 'Summarizing...',
      ctaHint:
          'Gemini reads the document and produces a structured summary '
          '(overview, key points, topics). Best for documents under '
          '~30k characters of extracted text — longer ones get '
          'truncated to the first chunk.',
      extraForm: const SizedBox.shrink(),
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
          'max_length': 500,
        });
        final resp = await dio.post('/api/v1/ai/summarize', data: form);
        return resp.data as Map<String, dynamic>;
      },
      buildResult: (context, response) {
        final summary = (response['summary'] as String?) ?? '';
        final origLen = response['original_length'] as int? ?? 0;
        final sumLen = response['summary_length'] as int? ?? 0;
        if (summary.isEmpty) {
          return _ResultCard(
            title: 'No summary produced',
            body: 'The model returned an empty response. Try a different '
                'document or retry.',
            accent: AppColors.catAi,
            action: null,
          );
        }
        return _ResultCard(
          title: 'Summary',
          subtitle: origLen > 0
              ? '$origLen → $sumLen characters'
              : null,
          body: summary,
          accent: AppColors.catAi,
          action: TextButton.icon(
            onPressed: () => Clipboard.setData(ClipboardData(text: summary)),
            icon: const Icon(Icons.copy, size: 18),
            label: const Text('Copy'),
          ),
        );
      },
    );
  }
}

class _ResultCard extends StatelessWidget {
  final String title;
  final String? subtitle;
  final String body;
  final Color accent;
  final Widget? action;

  const _ResultCard({
    required this.title,
    required this.body,
    required this.accent,
    this.subtitle,
    this.action,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: accent.withOpacity(0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.auto_awesome, color: accent, size: 20),
              const SizedBox(width: 8),
              Text(
                title,
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: accent,
                ),
              ),
              const Spacer(),
              if (action != null) action!,
            ],
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 4),
            Text(
              subtitle!,
              style: const TextStyle(
                fontSize: 12,
                color: AppColors.textMutedLight,
              ),
            ),
          ],
          const SizedBox(height: 12),
          SelectableText(
            body,
            style: const TextStyle(
              fontSize: 14,
              color: AppColors.textLight,
              height: 1.6,
            ),
          ),
        ],
      ),
    );
  }
}
