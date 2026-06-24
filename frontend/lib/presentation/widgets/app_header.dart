import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme_provider.dart';
import 'brand_logo.dart';

class AppHeader extends ConsumerWidget implements PreferredSizeWidget {
  final bool showSignIn;

  const AppHeader({super.key, this.showSignIn = true});

  @override
  Size get preferredSize => const Size.fromHeight(64);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeNotifier = ref.read(themeProvider.notifier);

    // AppHeader is currently only used on the auth pages, which
    // are hardcoded dark. Render it in dark mode regardless of
    // the surrounding theme — otherwise the body is dark but the
    // header reads the app theme (light), and the foreground
    // text + brand mark disappear against the dark bg.
    const fgColor = Colors.white;
    const mutedColor = Color(0xFF9CA3AF);

    return Container(
      height: 64,
      decoration: const BoxDecoration(
        color: Color(0xFF1a1a2e),
        border: Border(
          bottom: BorderSide(color: Color(0xFF1f2937), width: 1),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Row(
          children: [
            // Logo
            GestureDetector(
              onTap: () => context.go('/'),
              child: Row(
                children: [
                  const BrandLogo.mark(height: 32, forceDark: true),
                  const SizedBox(width: 10),
                  Text(
                    'ProPDFs',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                      color: fgColor,
                    ),
                  ),
                ],
              ),
            ),
            const Spacer(),
            // Nav links (desktop only)
            if (MediaQuery.of(context).size.width > 600) ...[
              _NavLink('Tools', '/tools'),
              _NavLink('Pricing', '/pricing'),
              _NavLink('Blog', '/blog'),
              _BetaBadge(),
              _NavLink('vs alternatives', '/compare'),
              const SizedBox(width: 16),
            ],
            // Language selector
            IconButton(
              icon: Icon(Icons.language, color: mutedColor, size: 20),
              onPressed: () {},
            ),
            // Theme toggle. Hardcoded for dark mode (the header is
            // always rendered dark on auth pages) — the icon shows
            // the sun to invite the user to switch to light.
            IconButton(
              icon: const Icon(
                Icons.wb_sunny_outlined,
                color: Color(0xFF9CA3AF),
                size: 20,
              ),
              onPressed: () => themeNotifier.toggle(),
            ),
            const SizedBox(width: 8),
            // Sign in button
            if (showSignIn)
              SizedBox(
                height: 36,
                child: ElevatedButton(
                  onPressed: () => context.go('/login'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF2563EB),
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                  ),
                  child: const Text('Sign in', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _NavLink extends StatelessWidget {
  final String label;
  final String route;

  const _NavLink(this.label, this.route);

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: TextButton(
        onPressed: () => context.go(route),
        style: TextButton.styleFrom(
          foregroundColor:
              isDark ? Colors.grey[400] : const Color(0xFF334155),
          padding: EdgeInsets.zero,
        ),
        child: Text(
          label,
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
        ),
      ),
    );
  }
}

class _BetaBadge extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xFF2563EB).withOpacity(0.2),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFF2563EB).withOpacity(0.4)),
      ),
      child: const Text(
        'Beta',
        style: TextStyle(
          color: Color(0xFF2563EB),
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
