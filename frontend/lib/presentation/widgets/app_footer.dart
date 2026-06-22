import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class AppFooter extends ConsumerWidget {
  const AppFooter({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    // Simplest possible footer. Explicit height (110px) is the entire
    // contract — no Material wrapper, no SafeArea, no ConstrainedBox.
    // Any wrapping widget that tries to compute intrinsic height
    // collapses the parent Scaffold body to 0×0 in Flutter web CanvasKit.
    return SizedBox(
      height: 110,
      child: Container(
        color: isDark ? const Color(0xFF0a0a0f) : Colors.white,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            // Brand row
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Container(
                    width: 20,
                    height: 20,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFF2563EB), Color(0xFF7C3AED)],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(5),
                    ),
                    child: const Icon(
                      Icons.picture_as_pdf,
                      size: 12,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'ProPDFs',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: isDark ? Colors.white : Colors.black87,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '© 2026 · Powered by Elixio Digital',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey[500],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            // Links row — horizontal scroll for narrow viewports
            SizedBox(
              height: 32,
              child: ListView(
                scrollDirection: Axis.horizontal,
                shrinkWrap: true,
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: [
                  _FooterLink('Pricing', '/pricing'),
                  const SizedBox(width: 16),
                  _FooterLink('Tools', '/tools'),
                  const SizedBox(width: 16),
                  _FooterLink('Blog', '/blog'),
                  const SizedBox(width: 16),
                  _FooterLink('vs alternatives', '/compare'),
                  const SizedBox(width: 16),
                  _FooterLink('About', '/about'),
                  const SizedBox(width: 16),
                  _FooterLink('Contact', '/contact'),
                  const SizedBox(width: 16),
                  _FooterLink('Privacy', '/privacy'),
                  const SizedBox(width: 16),
                  _FooterLink('Terms', '/terms'),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FooterLink extends StatelessWidget {
  final String label;
  final String route;

  const _FooterLink(this.label, this.route);

  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: () => context.go(route),
      style: TextButton.styleFrom(
        foregroundColor: Colors.grey[500],
        padding: EdgeInsets.zero,
        minimumSize: const Size(0, 32),
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
      ),
      child: Text(
        label,
        style: const TextStyle(fontSize: 13),
      ),
    );
  }
}
