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
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final fgColor = isDark ? Colors.white : const Color(0xFF0F172A);
    final mutedColor = isDark ? Colors.grey[400]! : Colors.grey[600]!;

    return Container(
      height: 64,
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF0a0a0f) : Colors.white,
        border: Border(
          bottom: BorderSide(
            color: isDark ? Colors.grey[900]! : Colors.grey[200]!,
            width: 1,
          ),
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
                  const BrandLogo.mark(height: 32),
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
            // Theme toggle
            IconButton(
              icon: Icon(
                isDark ? Icons.wb_sunny_outlined : Icons.dark_mode_outlined,
                color: mutedColor,
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
