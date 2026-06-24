import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import '../providers/auth_provider.dart';
import '../widgets/app_footer.dart';
import '../widgets/brand_logo.dart';

/// About page — public marketing screen. Same shell as HomeScreen + PricingScreen
/// so navigation stays seamless.
class AboutScreen extends ConsumerWidget {
  const AboutScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authStateProvider);
    final isLoggedIn = authState.value?.user != null;
    final isWide = MediaQuery.of(context).size.width >= 900;

    return Scaffold(
      backgroundColor: AppColors.surfaceLight,
      body: Column(
        children: [
          _MarketingHeader(isLoggedIn: isLoggedIn),
          Expanded(
            child: SingleChildScrollView(
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 1000),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 24, vertical: 64),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        // Hero
                        Text(
                          'We built ProPDFs\nbecause PDFs\nshouldn\u2019t be painful.',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: isWide ? 56 : 36,
                            fontWeight: FontWeight.w800,
                            height: 1.1,
                            color: AppColors.textLight,
                          ),
                        ),
                        const SizedBox(height: 24),
                        Text(
                          'Founded in 2026, ProPDFs is a solo-founder project on a '
                          'mission to make every PDF tool fast, private, and free '
                          'for anyone who needs it.',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: isWide ? 20 : 16,
                            color: AppColors.textMutedLight,
                            height: 1.6,
                          ),
                        ),
                        const SizedBox(height: 72),

                        // Mission
                        _SectionTitle('Our mission'),
                        const SizedBox(height: 16),
                        _Body(
                          'Most online PDF tools are slow, ad-heavy, and ship your '
                          'files to opaque backends. We think that\u2019s wrong. '
                          'ProPDFs runs server-side processing with end-to-end '
                          'encryption, never reads your files, and never serves ads. '
                          'The free tier is the product. The Pro tier pays for the '
                          'infrastructure.',
                        ),
                        const SizedBox(height: 56),

                        // Values
                        _SectionTitle('What we believe'),
                        const SizedBox(height: 24),
                        _Value(
                          icon: Icons.lock_outline,
                          title: 'Privacy is a default, not a premium',
                          body:
                              'No file leaves its origin server unencrypted. No behaviour '
                              'profile is built. No data is sold — period.',
                        ),
                        _Value(
                          icon: Icons.flash_on,
                          title: 'Speed matters',
                          body:
                              'Most PDFs process in under a second. The slowest case on '
                              'the free tier is the largest case on the paid tier.',
                        ),
                        _Value(
                          icon: Icons.public,
                          title: 'Available everywhere',
                          body:
                              'Web, iOS, Android, Windows, macOS, Linux — one codebase, '
                              'one feature set, no platform tax.',
                        ),
                        _Value(
                          icon: Icons.translate,
                          title: 'Truly multilingual',
                          body:
                              '25+ languages at launch, with more added by the people who '
                              'actually use them.',
                        ),
                        const SizedBox(height: 56),

                        // Story
                        _SectionTitle('The story so far'),
                        const SizedBox(height: 16),
                        _Body(
                          'ProPDFs started as a side project to make a single PDF '
                          'merge tool that didn\u2019t ask for an email address. It '
                          'grew into 35 tools across 7 categories, a Flutter app '
                          'shipping to 6 platforms, and a backend that processes '
                          'thousands of PDFs a day.',
                        ),
                        const SizedBox(height: 16),
                        _Body(
                          'We\u2019re a small team (right now: one person and a '
                          'very patient AI assistant), bootstrapped, and shipping '
                          'in the open. Every release notes file is public. Every '
                          'outage gets a postmortem.',
                        ),
                        const SizedBox(height: 56),

                        // CTA
                        Container(
                          padding: const EdgeInsets.all(40),
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              colors: [
                                AppColors.primaryLight.withValues(alpha: 0.08),
                                AppColors.accent.withValues(alpha: 0.08),
                              ],
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                            ),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: AppColors.borderLight),
                          ),
                          child: Column(
                            children: [
                              Text(
                                'Ready to try it?',
                                style: TextStyle(
                                  fontSize: 28,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.textLight,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                'No sign-up needed. Pick a tool, drop a PDF, done.',
                                style: TextStyle(
                                  fontSize: 16,
                                  color: AppColors.textMutedLight,
                                ),
                              ),
                              const SizedBox(height: 24),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  FilledButton(
                                    onPressed: () => context.go('/tools'),
                                    style: FilledButton.styleFrom(
                                      backgroundColor: AppColors.primaryLight,
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 32, vertical: 16),
                                    ),
                                    child: const Text('Explore 35 tools'),
                                  ),
                                  const SizedBox(width: 12),
                                  OutlinedButton(
                                    onPressed: () => context.go('/pricing'),
                                    style: OutlinedButton.styleFrom(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 32, vertical: 16),
                                    ),
                                    child: const Text('See pricing'),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),

                        const SizedBox(height: 48),
                        const AppFooter(),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ---------- SECTIONS ----------

class _SectionTitle extends StatelessWidget {
  final String text;
  const _SectionTitle(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: TextStyle(
        fontSize: 28,
        fontWeight: FontWeight.w700,
        color: AppColors.textLight,
      ),
    );
  }
}

class _Body extends StatelessWidget {
  final String text;
  const _Body(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: TextStyle(
        fontSize: 16,
        height: 1.7,
        color: AppColors.textLight,
      ),
    );
  }
}

class _Value extends StatelessWidget {
  final IconData icon;
  final String title;
  final String body;

  const _Value({
    required this.icon,
    required this.title,
    required this.body,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: AppColors.primaryLight.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: AppColors.primaryLight, size: 22),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textLight,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  body,
                  style: TextStyle(
                    fontSize: 15,
                    color: AppColors.textMutedLight,
                    height: 1.5,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ---------- HEADER ----------

class _MarketingHeader extends StatelessWidget {
  final bool isLoggedIn;
  const _MarketingHeader({required this.isLoggedIn});

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
                child: const BrandLogo.inline(height: 32),
              ),
              const Spacer(),
              if (MediaQuery.of(context).size.width >= 600) ...[
                _NavLink(label: 'All Tools', route: '/tools'),
                _NavLink(label: 'Pricing', route: '/pricing'),
                _NavLink(label: 'Blog', route: '/blog'),
                _NavLink(label: 'About', route: '/about'),
              ],
              const SizedBox(width: 12),
              if (!isLoggedIn)
                TextButton(
                  onPressed: () => context.go('/login'),
                  child: const Text('Log in'),
                ),
              if (!isLoggedIn)
                FilledButton(
                  onPressed: () => context.go('/register'),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primaryLight,
                  ),
                  child: const Text('Sign up'),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavLink extends StatelessWidget {
  final String label;
  final String route;
  const _NavLink({required this.label, required this.route});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: InkWell(
        onTap: () => context.go(route),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 4),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w500,
              color: AppColors.textMutedLight,
            ),
          ),
        ),
      ),
    );
  }
}