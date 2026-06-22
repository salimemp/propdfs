import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class AppFooter extends ConsumerWidget {
  const AppFooter({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    // The previous Wrap-based layout worked on iOS/Android but had an
    // intrinsic-height calculation issue when used as a Scaffold
    // `bottomNavigationBar` in Flutter web (CanvasKit renderer). The Wrap
    // would report an unbounded height in that slot, causing the body to
    // get 0 height and the whole screen to render blank with only the
    // overlay cookie banner visible. A two-row `Column` of `Row`s with
    // `mainAxisAlignment` set gives a definite intrinsic height on every
    // renderer.
    final brand = Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Container(
          width: 24,
          height: 24,
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFF2563EB), Color(0xFF7C3AED)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(6),
          ),
          child: const Center(
            child: Icon(
              Icons.picture_as_pdf,
              size: 14,
              color: Colors.white,
            ),
          ),
        ),
        const SizedBox(width: 8),
        Text(
          'ProPDFs',
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            color: isDark ? Colors.white : Colors.black87,
          ),
        ),
        const SizedBox(width: 8),
        Text(
          '© 2026 ProPDFs',
          style: TextStyle(
            fontSize: 13,
            color: Colors.grey[500],
          ),
        ),
        const SizedBox(width: 8),
        Text(
          '·',
          style: TextStyle(
            fontSize: 13,
            color: Colors.grey[500],
          ),
        ),
        const SizedBox(width: 8),
        Flexible(
          child: Text(
            'Powered by Elixio Digital',
            style: TextStyle(
              fontSize: 13,
              color: Colors.grey[500],
            ),
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );

    final links = Wrap(
      alignment: WrapAlignment.center,
      crossAxisAlignment: WrapCrossAlignment.center,
      spacing: 16,
      runSpacing: 4,
      children: [
        _FooterLink('Pricing', '/pricing'),
        _FooterLink('Tools', '/tools'),
        _FooterLink('Blog', '/blog'),
        _FooterLink('vs alternatives', '/compare'),
        _FooterLink('About', '/about'),
        _FooterLink('Contact', '/contact'),
        _FooterLink('Privacy', '/privacy'),
        _FooterLink('Terms', '/terms'),
      ],
    );

    return Material(
      color: isDark ? const Color(0xFF0a0a0f) : Colors.white,
      child: SafeArea(
        top: false,
        child: Container(
          width: double.infinity,
          decoration: BoxDecoration(
            border: Border(
              top: BorderSide(
                color: isDark ? Colors.grey[900]! : Colors.grey[200]!,
                width: 1,
              ),
            ),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 1200),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  brand,
                  const SizedBox(height: 12),
                  links,
                ],
              ),
            ),
          ),
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
        minimumSize: Size.zero,
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
      ),
      child: Text(
        label,
        style: const TextStyle(fontSize: 13),
      ),
    );
  }
}
