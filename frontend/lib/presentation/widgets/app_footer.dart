import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class AppFooter extends ConsumerWidget {
  const AppFooter({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      height: 88,
      color: isDark ? const Color(0xFF0a0a0f) : Colors.white,
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Text(
              'ProPDFs © 2026 · Powered by Elixio Digital',
              style: TextStyle(
                fontSize: 12,
                color: Colors.grey[500],
              ),
            ),
            const SizedBox(width: 24),
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
    );
  }
}

class _FooterLink extends StatelessWidget {
  final String label;
  final String route;

  const _FooterLink(this.label, this.route);

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => context.go(route),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
        child: Text(
          label,
          style: TextStyle(fontSize: 13, color: Colors.grey[500]),
        ),
      ),
    );
  }
}
