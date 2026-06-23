import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import '../../core/tools/tool_registry.dart';
import '../widgets/app_footer.dart';

/// Catalog view — lists every tool registered in [ToolRegistry] as a
/// clickable card. Reached at `/tools` (no slug).
///
/// Per-tool pages now live at `/tools/<id>` (see [ToolPage] and
/// [ComingSoonToolPage]); this screen just gives users a single place to
/// browse the full catalog with category filters.
class PdfToolsScreen extends ConsumerStatefulWidget {
  /// Legacy query-param support: `?tool=<id>` redirects the user straight
  /// to the per-tool page. Kept so old share-links (e.g. /tools?tool=merge)
  /// still work.
  final String? initialTool;

  const PdfToolsScreen({super.key, this.initialTool});

  @override
  ConsumerState<PdfToolsScreen> createState() => _PdfToolsScreenState();
}

class _PdfToolsScreenState extends ConsumerState<PdfToolsScreen> {
  String _activeCategory = 'All';

  @override
  void initState() {
    super.initState();
    // Legacy compat: /tools?tool=merge → /tools/merge
    if (widget.initialTool != null && widget.initialTool!.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        final tool = ToolRegistry.findById(widget.initialTool!);
        if (tool != null) {
          context.go('/tools/${tool.id}');
        } else {
          // Unknown slug — fall back to catalog rather than throwing.
          context.go('/tools');
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _activeCategory == 'All'
        ? ToolRegistry.all
        : ToolRegistry.byCategory(_activeCategory);

    return Scaffold(
      backgroundColor: AppColors.surfaceLight,
      body: Column(
        children: [
          _Header(),
          Expanded(
            child: SingleChildScrollView(
              child: Column(
                children: [
                  _CategoryBar(
                    active: _activeCategory,
                    onSelect: (c) => setState(() => _activeCategory = c),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(24, 8, 24, 48),
                    child: Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 1200),
                        child: Wrap(
                          spacing: 16,
                          runSpacing: 16,
                          alignment: WrapAlignment.start,
                          children: [
                            for (final tool in filtered)
                              _ToolCard(tool: tool),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const AppFooter(),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surfaceLight,
        border: Border(
          bottom: BorderSide(color: AppColors.borderLight, width: 1),
        ),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1200),
          child: Row(
            children: [
              InkWell(
                onTap: () => context.go('/home'),
                child: Row(
                  children: [
                    Container(
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [AppColors.primary, AppColors.accent],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Icon(
                        Icons.picture_as_pdf,
                        color: Colors.white,
                        size: 18,
                      ),
                    ),
                    const SizedBox(width: 10),
                    const Text(
                      'ProPDFs',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: AppColors.textLight,
                        letterSpacing: -0.3,
                      ),
                    ),
                  ],
                ),
              ),
              const Spacer(),
              Text(
                'All ${ToolRegistry.all.length} tools',
                style: const TextStyle(
                  fontSize: 14,
                  color: AppColors.textMutedLight,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CategoryBar extends StatelessWidget {
  final String active;
  final ValueChanged<String> onSelect;
  const _CategoryBar({required this.active, required this.onSelect});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1200),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Browse all tools',
                style: TextStyle(
                  fontSize: 32,
                  fontWeight: FontWeight.w800,
                  color: AppColors.textLight,
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Every PDF tool we offer, organized by what you\'re trying to do.',
                style: TextStyle(
                  fontSize: 15,
                  color: AppColors.textMutedLight,
                ),
              ),
              const SizedBox(height: 20),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final cat in ToolRegistry.categories)
                    _CategoryChip(
                      label: cat,
                      active: cat == active,
                      onTap: () => onSelect(cat),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CategoryChip extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  const _CategoryChip({
    required this.label,
    required this.active,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
        decoration: BoxDecoration(
          color: active ? AppColors.primary : AppColors.surfaceLight,
          border: Border.all(
            color: active ? AppColors.primary : AppColors.borderLight,
            width: 1.5,
          ),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: active ? Colors.white : AppColors.textLight,
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}

class _ToolCard extends StatelessWidget {
  final ToolConfig tool;
  const _ToolCard({required this.tool});

  @override
  Widget build(BuildContext context) {
    final cardWidth = ((MediaQuery.of(context).size.width - 48 - 48 - (3 * 16)) / 4)
        .clamp(160.0, 280.0);

    final isComingSoon = tool.status == ToolStatus.comingSoon;

    return SizedBox(
      width: cardWidth,
      height: 170,
      child: Material(
        color: AppColors.surfaceLight,
        elevation: 0,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: () => context.go('/tools/${tool.id}'),
          borderRadius: BorderRadius.circular(12),
          child: Container(
            decoration: BoxDecoration(
              border: Border.all(color: AppColors.borderLight, width: 1),
              borderRadius: BorderRadius.circular(12),
            ),
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: tool.color.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Icon(tool.icon, color: tool.color, size: 22),
                    ),
                    const Spacer(),
                    if (isComingSoon)
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: AppColors.warning.withOpacity(0.10),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: const Text(
                          'Soon',
                          style: TextStyle(
                            color: AppColors.warning,
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  tool.title,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textLight,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                Text(
                  tool.description,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textMutedLight,
                    height: 1.3,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
