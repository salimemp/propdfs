import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/theme.dart';
import '../../widgets/ai_tool_scaffold.dart';

/// AI Translate — picks a target language from the list the
/// backend returns, then POSTs to /api/v1/ai/translate.
class AiTranslatePage extends ConsumerStatefulWidget {
  const AiTranslatePage({super.key});

  @override
  ConsumerState<AiTranslatePage> createState() => _AiTranslatePageState();
}

class _AiTranslatePageState extends ConsumerState<AiTranslatePage> {
  String _target = 'Spanish';
  List<String> _languages = const [
    'Spanish', 'French', 'German', 'Hindi', 'Portuguese',
    'Mandarin Chinese', 'Japanese', 'Korean', 'Italian', 'Dutch',
    'Russian', 'Arabic', 'Turkish', 'Vietnamese', 'Thai',
  ];
  bool _loadingLanguages = true;

  @override
  void initState() {
    super.initState();
    _loadLanguages();
  }

  Future<void> _loadLanguages() async {
    try {
      final dio = ref.read(apiClientProvider);
      final resp = await dio.get('/api/v1/ai/languages');
      final list = (resp.data['languages'] as List?)?.cast<String>();
      if (list != null && list.isNotEmpty && mounted) {
        setState(() {
          _languages = list;
          if (!list.contains(_target)) _target = list.first;
          _loadingLanguages = false;
        });
        return;
      }
    } catch (_) {
      // Network error — keep the seed list.
    }
    if (mounted) setState(() => _loadingLanguages = false);
  }

  @override
  Widget build(BuildContext context) {
    return AiToolScaffold(
      accent: AppColors.catAi,
      title: 'AI Translate',
      heroIcon: Icons.translate,
      ctaLabel: 'Translate',
      busyLabel: 'Translating...',
      ctaHint:
          'The document text is sent to Gemini with a translation '
          'prompt. The response is plain text — formatting, images, '
          'and tables from the original are not preserved in this '
          'flow. Use "PDF to Word" or "PDF to Markdown" if you need '
          'a translated file you can save.',
      extraForm: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surfaceMutedLight,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.borderLight),
        ),
        child: Row(
          children: [
            const Icon(Icons.language, color: AppColors.catAi, size: 20),
            const SizedBox(width: 12),
            const Text(
              'Target language',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppColors.textLight,
              ),
            ),
            const Spacer(),
            DropdownButton<String>(
              value: _target,
              underline: const SizedBox.shrink(),
              items: _languages
                  .map((l) => DropdownMenuItem(value: l, child: Text(l)))
                  .toList(),
              onChanged: _loadingLanguages
                  ? null
                  : (v) {
                      if (v != null) setState(() => _target = v);
                    },
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
          'request': {'target_language': _target},
        });
        final resp = await dio.post('/api/v1/ai/translate', data: form);
        return resp.data as Map<String, dynamic>;
      },
      buildResult: (context, response) {
        final translated = (response['translated_text'] as String?) ?? '';
        final lang = response['target_language'] as String? ?? _target;
        if (translated.isEmpty) {
          return _AiTextResult(
            title: 'No translation',
            body: 'The model returned an empty response. Try a different '
                'document or language.',
            accent: AppColors.catAi,
          );
        }
        return _AiTextResult(
          title: 'Translated to $lang',
          body: translated,
          accent: AppColors.catAi,
          action: TextButton.icon(
            onPressed: () =>
                Clipboard.setData(ClipboardData(text: translated)),
            icon: const Icon(Icons.copy, size: 18),
            label: const Text('Copy'),
          ),
        );
      },
    );
  }
}

class _AiTextResult extends StatelessWidget {
  final String title;
  final String body;
  final Color accent;
  final Widget? action;

  const _AiTextResult({
    required this.title,
    required this.body,
    required this.accent,
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
              Icon(Icons.translate, color: accent, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: accent,
                  ),
                ),
              ),
              if (action != null) action!,
            ],
          ),
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
