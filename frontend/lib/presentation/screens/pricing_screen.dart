import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import '../providers/auth_provider.dart';
import '../widgets/app_footer.dart';

/// Pricing page — public marketing screen, mirrors the home page header/footer
/// style so navigation feels seamless. Free tier is the focus; Pro tier explains
/// the value gap (larger files, batch, AI).
class PricingScreen extends ConsumerWidget {
  const PricingScreen({super.key});

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
                  constraints: const BoxConstraints(maxWidth: 1200),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 24, vertical: 64),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        // Headline
                        Text(
                          'Pricing built for everyone.',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: isWide ? 56 : 36,
                            fontWeight: FontWeight.w800,
                            height: 1.1,
                            color: AppColors.textLight,
                          ),
                        ),
                        const SizedBox(height: 16),
                        Text(
                          'Start free, upgrade only when you need more power. '
                          'No ads, no watermarks, no surprises.',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: isWide ? 20 : 16,
                            color: AppColors.textMutedLight,
                          ),
                        ),
                        const SizedBox(height: 56),

                        // Tier cards
                        isWide
                            ? const Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Expanded(child: _FreeTierCard()),
                                  SizedBox(width: 24),
                                  Expanded(child: _ProTierCard()),
                                  SizedBox(width: 24),
                                  Expanded(child: _BusinessTierCard()),
                                ],
                              )
                            : const Column(
                                children: [
                                  _FreeTierCard(),
                                  SizedBox(height: 24),
                                  _ProTierCard(),
                                  SizedBox(height: 24),
                                  _BusinessTierCard(),
                                ],
                              ),

                        const SizedBox(height: 64),

                        // FAQ teaser
                        Container(
                          padding: const EdgeInsets.all(32),
                          decoration: BoxDecoration(
                            color: AppColors.surfaceMutedLight,
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: AppColors.borderLight),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Common questions',
                                style: TextStyle(
                                  fontSize: 24,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.textLight,
                                ),
                              ),
                              const SizedBox(height: 16),
                              _FaqItem(
                                question: 'Do I need to create an account?',
                                answer:
                                    'No. Every PDF tool works without sign-up. '
                                    'Accounts are only needed to save files across devices.',
                              ),
                              _FaqItem(
                                question: 'Is my data private?',
                                answer:
                                    'Yes. All files are encrypted in transit and deleted after 1 hour. '
                                    'We never read, share, or train on your documents.',
                              ),
                              _FaqItem(
                                question: 'Can I cancel anytime?',
                                answer:
                                    'Yes. Cancel from your account settings — no email, no support ticket. '
                                    'You keep Pro access until the end of your billing period.',
                              ),
                              _FaqItem(
                                question: 'Do you offer refunds?',
                                answer:
                                    'Yes — full refund within 14 days of purchase, no questions asked.',
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

// ---------- TIER CARDS ----------

class _FreeTierCard extends StatelessWidget {
  const _FreeTierCard();

  @override
  Widget build(BuildContext context) {
    return _TierCard(
      name: 'Free',
      price: r'$0',
      cadence: 'forever',
      tagline: 'Everything you need to handle PDFs.',
      ctaLabel: 'Get started',
      onCta: () => context.go('/tools'),
      highlighted: false,
      features: const [
        'All 35 PDF tools',
        'Up to 50 MB per file',
        'Up to 3 files per task',
        'Daily fair-use limits',
        'Standard processing speed',
        'Ad-free, watermark-free',
      ],
    );
  }
}

class _ProTierCard extends StatelessWidget {
  const _ProTierCard();

  @override
  Widget build(BuildContext context) {
    return _TierCard(
      name: 'Pro',
      price: r'$7',
      cadence: 'per month',
      tagline: 'Power features for daily PDF work.',
      ctaLabel: 'Start 14-day trial',
      onCta: () => context.go('/register'),
      highlighted: true,
      features: const [
        'Everything in Free',
        'Up to 500 MB per file',
        'Unlimited files per task',
        'No daily limits',
        'Priority processing queue',
        'AI tools included',
        'Batch operations',
        'Email support',
      ],
    );
  }
}

class _BusinessTierCard extends StatelessWidget {
  const _BusinessTierCard();

  @override
  Widget build(BuildContext context) {
    return _TierCard(
      name: 'Business',
      price: r'$24',
      cadence: 'per user / month',
      tagline: 'Team plans with admin controls.',
      ctaLabel: 'Contact sales',
      onCta: () => context.go('/about'),
      highlighted: false,
      features: const [
        'Everything in Pro',
        'Up to 2 GB per file',
        'Team workspaces',
        'SSO / SAML',
        'Admin dashboard',
        'Custom branding',
        'SLA + priority support',
        'Audit logs',
      ],
    );
  }
}

class _TierCard extends StatelessWidget {
  final String name;
  final String price;
  final String cadence;
  final String tagline;
  final String ctaLabel;
  final VoidCallback onCta;
  final bool highlighted;
  final List<String> features;

  const _TierCard({
    required this.name,
    required this.price,
    required this.cadence,
    required this.tagline,
    required this.ctaLabel,
    required this.onCta,
    required this.highlighted,
    required this.features,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(
        color: highlighted ? AppColors.primaryLight : AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: highlighted ? AppColors.primaryLight : AppColors.borderLight,
          width: highlighted ? 0 : 1,
        ),
        boxShadow: highlighted
            ? [
                BoxShadow(
                  color: AppColors.primaryLight.withValues(alpha: 0.25),
                  blurRadius: 32,
                  offset: const Offset(0, 12),
                ),
              ]
            : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                name,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.2,
                  color: highlighted ? Colors.white : AppColors.primaryLight,
                ),
              ),
              if (highlighted) ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: const Text(
                    'POPULAR',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1,
                      color: Colors.white,
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 16),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                price,
                style: TextStyle(
                  fontSize: 48,
                  fontWeight: FontWeight.w800,
                  color: highlighted
                      ? Colors.white
                      : AppColors.textLight,
                  height: 1,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                cadence,
                style: TextStyle(
                  fontSize: 14,
                  color: highlighted
                      ? Colors.white.withValues(alpha: 0.7)
                      : AppColors.textMutedLight,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            tagline,
            style: TextStyle(
              fontSize: 14,
              color: highlighted
                  ? Colors.white.withValues(alpha: 0.85)
                  : AppColors.textMutedLight,
            ),
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: onCta,
              style: FilledButton.styleFrom(
                backgroundColor:
                    highlighted ? Colors.white : AppColors.primaryLight,
                foregroundColor:
                    highlighted ? AppColors.primaryLight : Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
              child: Text(
                ctaLabel,
                style: const TextStyle(
                    fontSize: 15, fontWeight: FontWeight.w600),
              ),
            ),
          ),
          const SizedBox(height: 28),
          ...features.map((f) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      Icons.check_circle,
                      size: 18,
                      color: highlighted
                          ? Colors.white
                          : AppColors.primaryLight,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        f,
                        style: TextStyle(
                          fontSize: 14,
                          color: highlighted
                              ? Colors.white.withValues(alpha: 0.9)
                              : AppColors.textLight,
                        ),
                      ),
                    ),
                  ],
                ),
              )),
        ],
      ),
    );
  }
}

class _FaqItem extends StatelessWidget {
  final String question;
  final String answer;
  const _FaqItem({required this.question, required this.answer});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            question,
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: AppColors.textLight,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            answer,
            style: TextStyle(
              fontSize: 15,
              color: AppColors.textMutedLight,
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }
}

// ---------- HEADER (matches home_screen style) ----------

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
                child: Row(
                  children: [
                    Container(
                      width: 32,
                      height: 32,
                      decoration: const BoxDecoration(
                        gradient: LinearGradient(
                          colors: [AppColors.primaryLight, AppColors.accent],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        borderRadius: BorderRadius.all(Radius.circular(8)),
                      ),
                      child: const Icon(Icons.description,
                          color: Colors.white, size: 18),
                    ),
                    const SizedBox(width: 10),
                    const Text(
                      'ProPDFs',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
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