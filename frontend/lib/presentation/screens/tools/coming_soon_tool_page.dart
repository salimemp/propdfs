import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme.dart';
import '../../../core/tools/tool_registry.dart';

/// Per-tool "coming soon" page. Renders for every [ToolConfig] whose
/// `status == ToolStatus.comingSoon` so that:
///   - Repair PDF no longer falls back to Merge
///   - OCR PDF no longer falls back to Merge
///   - Edit / Security / AI cards no longer fall back to Merge or Convert
///
/// Each tool gets its own URL (`/tools/<id>`) and a tailored placeholder
/// that shows the tool's actual title, icon, color, and long description —
/// not a generic "coming soon" stub.
class ComingSoonToolPage extends ConsumerWidget {
  final ToolConfig tool;

  const ComingSoonToolPage({super.key, required this.tool});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
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
                color: tool.color.withOpacity(0.12),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(tool.icon, size: 18, color: tool.color),
            ),
            const SizedBox(width: 10),
            Text(tool.title),
          ],
        ),
      ),
      body: SingleChildScrollView(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 720),
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  const SizedBox(height: 16),

                  // Hero icon
                  Container(
                    width: 96,
                    height: 96,
                    decoration: BoxDecoration(
                      color: tool.color.withOpacity(0.10),
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: Icon(tool.icon, size: 48, color: tool.color),
                  ),

                  const SizedBox(height: 24),

                  Text(
                    tool.title,
                    style: const TextStyle(
                      fontSize: 32,
                      fontWeight: FontWeight.w800,
                      color: AppColors.textLight,
                      letterSpacing: -0.5,
                    ),
                    textAlign: TextAlign.center,
                  ),

                  const SizedBox(height: 12),

                  // Category + coming-soon chip row
                  Wrap(
                    alignment: WrapAlignment.center,
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: tool.color.withOpacity(0.10),
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(
                            color: tool.color.withOpacity(0.30),
                          ),
                        ),
                        child: Text(
                          tool.category,
                          style: TextStyle(
                            color: tool.color,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: AppColors.warning.withOpacity(0.10),
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(
                            color: AppColors.warning.withOpacity(0.40),
                          ),
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.bolt,
                                size: 12, color: AppColors.warning),
                            SizedBox(width: 4),
                            Text(
                              'Coming soon',
                              style: TextStyle(
                                color: AppColors.warning,
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 28),

                  Text(
                    tool.longDescription ?? tool.description,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 16,
                      color: AppColors.textMutedLight,
                      height: 1.5,
                    ),
                  ),

                  const SizedBox(height: 36),

                  // What to do in the meantime — nudge to other tools
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: AppColors.surfaceMutedLight,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: AppColors.borderLight),
                    ),
                    child: Column(
                      children: [
                        const Icon(
                          Icons.work_outline,
                          color: AppColors.primary,
                          size: 28,
                        ),
                        const SizedBox(height: 12),
                        const Text(
                          'Need this today?',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                            color: AppColors.textLight,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          _meanwhileHint(tool),
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 14,
                            color: AppColors.textMutedLight,
                            height: 1.5,
                          ),
                        ),
                        const SizedBox(height: 16),
                        Wrap(
                          spacing: 12,
                          runSpacing: 8,
                          alignment: WrapAlignment.center,
                          children: _meanwhileCtas(context, tool),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 24),

                  TextButton.icon(
                    onPressed: () => context.go('/tools'),
                    icon: const Icon(Icons.apps),
                    label: const Text('Browse all 35 tools'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  String _meanwhileHint(ToolConfig t) {
    switch (t.id) {
      case 'repair':
        return 'Try Compress to rebuild the PDF — it re-serializes the file '
            'and often fixes minor corruption. For severe corruption, your '
            'desktop viewer may recover more data than we can server-side.';
      case 'ocr':
        return 'Until OCR lands, you can use a desktop scanner app (Apple '
            'Notes, Adobe Scan, Microsoft Lens) to make scanned PDFs '
            'searchable locally.';
      case 'sign':
        return 'Until Sign ships, use Preview on macOS or Adobe Acrobat '
            'Reader\'s "Fill & Sign" tool for signing on the fly.';
      case 'compare':
        return 'Until Compare ships, use the diff view in your favourite '
            'code editor (VS Code, Sublime) on the extracted text.';
      case 'protect':
      case 'unlock':
        return 'Until Protect / Unlock ship, use Preview on macOS or '
            'Adobe Acrobat to add or remove a password.';
      case 'redact':
        return 'Until Redact ships, use a PDF editor with redaction (Adobe '
            'Acrobat Pro, Foxit). Don\'t just black out text with a marker — '
            'the underlying data stays visible.';
      case 'pdfa':
        return 'Until PDF/A conversion ships, try the open-source '
            'veraPDF / Ghostscript pipeline on your machine.';
      default:
        return 'We\'re building this tool now. In the meantime, the rest of '
            'the ProPDFs catalog is live and free.';
    }
  }

  List<Widget> _meanwhileCtas(BuildContext context, ToolConfig t) {
    // Suggest a related, currently-live tool.
    ToolConfig? related;
    switch (t.category) {
      case 'Organize':
        related = ToolRegistry.findById('merge');
        break;
      case 'Optimize':
        related = ToolRegistry.findById('compress');
        break;
      case 'Convert':
        related = ToolRegistry.findById('pdf-to-jpg');
        break;
      case 'Edit':
        related = ToolRegistry.findById('rotate');
        break;
      case 'Security':
        related = null;
        break;
      case 'AI':
        related = null;
        break;
    }

    return [
      FilledButton.icon(
        onPressed: () => context.go('/tools'),
        icon: const Icon(Icons.apps),
        label: const Text('See live tools'),
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
        ),
      ),
      if (related != null)
        OutlinedButton.icon(
          onPressed: () => context.go('/tools/${related!.id}'),
          icon: Icon(related.icon, size: 18),
          label: Text('Try ${related.title}'),
        ),
    ];
  }
}
