import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class AppFooter extends ConsumerWidget {
  const AppFooter({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    // Ultra-minimal footer. Container with explicit height and color
    // containing a single Row of TextButtons. No SingleChildScrollView,
    // no ListView, no Wrap, no Column — every child has a definite
    // intrinsic height. On narrow screens the buttons overflow
    // (RenderFlex overflow warning) but still render visibly.
    return Container(
      height: 56,
      color: isDark ? const Color(0xFF0a0a0f) : Colors.white,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Text(
            'ProPDFs © 2026',
            style: TextStyle(fontSize: 12, color: Colors.grey[500]),
          ),
          const SizedBox(width: 16),
          _FooterLink('Pricing', '/pricing'),
          const SizedBox(width: 12),
          _FooterLink('Tools', '/tools'),
          const SizedBox(width: 12),
          _FooterLink('Blog', '/blog'),
          const SizedBox(width: 12),
          _FooterLink('Privacy', '/privacy'),
          const SizedBox(width: 12),
          _FooterLink('Terms', '/terms'),
        ],
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
    return GestureDetector(
      onTap: () => context.go(route),
      behavior: HitTestBehavior.opaque,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
        child: Text(
          label,
          style: TextStyle(fontSize: 12, color: Colors.grey[500]),
        ),
      ),
    );
  }
}
