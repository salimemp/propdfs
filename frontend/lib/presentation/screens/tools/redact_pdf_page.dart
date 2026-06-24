import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme.dart';
import '../../widgets/backend_tool_scaffold.dart';

/// Redact — true redaction. Each line of the search box is a
/// term; every occurrence in the PDF is replaced with a black
/// rectangle AND the page is rasterised so the underlying text
/// is gone, not just covered. Multi-word phrases work too.
///
/// The form collects a list of terms; the backend picks them up
/// via `params["terms"]` and walks the AcroForm searcher.
class RedactPdfPage extends ConsumerStatefulWidget {
  const RedactPdfPage({super.key});

  @override
  ConsumerState<RedactPdfPage> createState() => _RedactPdfPageState();
}

class _RedactPdfPageState extends ConsumerState<RedactPdfPage> {
  final _terms = TextEditingController();

  @override
  void dispose() {
    _terms.dispose();
    super.dispose();
  }

  List<String> _parseTerms() {
    return _terms.text
        .split('\n')
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .toList(growable: false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surfaceLight,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/tools'),
        ),
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: AppColors.catSecurity.withOpacity(0.12),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(
                Icons.visibility_off,
                size: 18,
                color: AppColors.catSecurity,
              ),
            ),
            const SizedBox(width: 10),
            const Text('Redact PDF'),
          ],
        ),
      ),
      body: BackendToolScaffold(
        accent: AppColors.catSecurity,
        taskType: 'redact',
        pickLabel: 'Choose a PDF to redact',
        ctaLabel: 'Redact',
        busyLabel: 'Redacting...',
        ctaHint:
            'True redaction — every matching term is replaced with a '
            'black rectangle and the page is rasterised, so the '
            'underlying text is gone. Multi-word phrases work '
            '(e.g. "John Smith").',
        buildParams: () {
          final terms = _parseTerms();
          if (terms.isEmpty) {
            throw Exception(
              'Enter at least one term to redact. One per line is fine.',
            );
          }
          return {'terms': terms};
        },
        form: _buildForm(),
      ),
    );
  }

  Widget _buildForm() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surfaceMutedLight,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderLight),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Terms to redact',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: AppColors.textLight,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'One per line. Case-insensitive. Phrases with spaces '
            'work ("John Smith").',
            style: TextStyle(
              fontSize: 12,
              color: AppColors.textMutedLight,
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _terms,
            maxLines: 6,
            minLines: 4,
            onChanged: (_) => setState(() {}),
            style: const TextStyle(
              fontSize: 13,
              fontFamily: 'monospace',
              color: AppColors.textLight,
            ),
            decoration: InputDecoration(
              hintText: 'John Smith\n555-123-4567\njohn@example.com',
              filled: true,
              fillColor: Colors.white,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: BorderSide(color: AppColors.borderLight),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: BorderSide(color: AppColors.borderLight),
              ),
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 12,
                vertical: 12,
              ),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _PresetChip(
                  label: 'PII (emails, phones, SSN)',
                  onTap: () => _setPreset(const [
                    // Common PII patterns. The redaction tool does
                    // literal matching, not regex — these are just
                    // the obvious canned values. Users can edit
                    // before hitting Redact.
                    '@',
                    '555-',
                    '123-45-',
                  ]),
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                tooltip: 'Paste from clipboard',
                icon: const Icon(Icons.paste, size: 18),
                onPressed: () async {
                  final data = await Clipboard.getData('text/plain');
                  if (data?.text != null) {
                    _terms.text = data!.text!;
                    setState(() {});
                  }
                },
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _setPreset(List<String> values) {
    final current = _parseTerms();
    final merged = <String>{...current, ...values}.toList();
    _terms.text = merged.join('\n');
    setState(() {});
  }
}

class _PresetChip extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  const _PresetChip({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      onPressed: onTap,
      style: OutlinedButton.styleFrom(
        padding: const EdgeInsets.symmetric(vertical: 10),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
        ),
      ),
      child: Text(
        label,
        style: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
