import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';

/// ProPDFs footer. Designed to be placed as the LAST child of a body
/// `Column` (NOT as Scaffold.bottomNavigationBar). Flutter web CanvasKit
/// has known intrinsic-height bugs with Scaffold.bottomNavigationBar, so
/// rendering this inside the scrollable body guarantees visibility on
/// every renderer.
class AppFooter extends ConsumerWidget {
  const AppFooter({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      color: AppColors.surfaceDark,
      padding: const EdgeInsets.symmetric(vertical: 48, horizontal: 24),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1200),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Top: brand + tagline
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [AppColors.primary, AppColors.accent],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(
                      Icons.picture_as_pdf,
                      color: Colors.white,
                      size: 22,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: const [
                        Text(
                          'ProPDFs',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 22,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        SizedBox(height: 4),
                        Text(
                          'Every PDF tool you need. Free, fast, and private.',
                          style: TextStyle(
                            color: AppColors.textMutedDark,
                            fontSize: 13,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 40),

              // Link columns (5 columns)
              Wrap(
                spacing: 32,
                runSpacing: 24,
                children: const [
                  _FooterColumn(
                    title: 'Product',
                    links: [
                      _FooterLinkSpec('Merge PDF', '/merge'),
                      _FooterLinkSpec('Split PDF', '/split'),
                      _FooterLinkSpec('Compress PDF', '/compress'),
                      _FooterLinkSpec('All tools', '/tools'),
                      _FooterLinkSpec('Pricing', '/pricing'),
                    ],
                  ),
                  _FooterColumn(
                    title: 'Convert',
                    links: [
                      _FooterLinkSpec('PDF to Word', '/pdf-to-word'),
                      _FooterLinkSpec('Word to PDF', '/word-to-pdf'),
                      _FooterLinkSpec('PDF to JPG', '/pdf-to-jpg'),
                      _FooterLinkSpec('JPG to PDF', '/jpg-to-pdf'),
                    ],
                  ),
                  _FooterColumn(
                    title: 'AI Tools',
                    links: [
                      _FooterLinkSpec('AI Summarize', '/tools'),
                      _FooterLinkSpec('AI Translate', '/tools'),
                      _FooterLinkSpec('Chat with PDF', '/ai-chat'),
                      _FooterLinkSpec('OCR PDF', '/tools'),
                    ],
                  ),
                  _FooterColumn(
                    title: 'Company',
                    links: [
                      _FooterLinkSpec('About', '/about'),
                      _FooterLinkSpec('Blog', '/blog'),
                      _FooterLinkSpec('vs alternatives', '/compare'),
                      _FooterLinkSpec('Contact', '/contact'),
                    ],
                  ),
                  _FooterColumn(
                    title: 'Legal',
                    links: [
                      _FooterLinkSpec('Privacy', '/privacy'),
                      _FooterLinkSpec('Terms', '/terms'),
                      _FooterLinkSpec('Cookie Policy', '/cookies'),
                      _FooterLinkSpec('GDPR', '/privacy'),
                    ],
                  ),
                ],
              ),

              const SizedBox(height: 40),

              // Bottom bar
              Container(
                padding: const EdgeInsets.only(top: 24),
                decoration: const BoxDecoration(
                  border: Border(
                    top: BorderSide(color: AppColors.borderDark, width: 1),
                  ),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        '© 2026 ProPDFs · Powered by Elixio Digital',
                        style: TextStyle(
                          color: AppColors.textMutedDark,
                          fontSize: 13,
                        ),
                      ),
                    ),
                    Wrap(
                      spacing: 16,
                      children: const [
                        _FooterTextLink('Privacy', '/privacy'),
                        _FooterTextLink('Terms', '/terms'),
                        _FooterTextLink('Cookies', '/cookies'),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FooterColumn extends StatelessWidget {
  final String title;
  final List<_FooterLinkSpec> links;

  const _FooterColumn({required this.title, required this.links});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 160,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 14,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 12),
          for (final link in links) ...[
            _FooterLinkButton(route: link.route, label: link.label),
            const SizedBox(height: 6),
          ],
        ],
      ),
    );
  }
}

class _FooterLinkSpec {
  final String label;
  final String route;
  const _FooterLinkSpec(this.label, this.route);
}

class _FooterLinkButton extends StatelessWidget {
  final String route;
  final String label;

  const _FooterLinkButton({required this.route, required this.label});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => context.go(route),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Text(
          label,
          style: const TextStyle(
            color: AppColors.textMutedDark,
            fontSize: 13,
          ),
        ),
      ),
    );
  }
}

class _FooterTextLink extends StatelessWidget {
  final String label;
  final String route;

  const _FooterTextLink(this.label, this.route);

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => context.go(route),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 4),
        child: Text(
          label,
          style: const TextStyle(
            color: AppColors.textMutedDark,
            fontSize: 13,
          ),
        ),
      ),
    );
  }
}
