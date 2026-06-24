import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/quota_provider.dart';

/// Compact daily-quota bar shown to authenticated users on the
/// home page. Renders two side-by-side indicators (AI + PROCESS)
/// with used/limit + a coloured fill. When the backend reports
/// `unlimited: true` the bar collapses to a "Unlimited" pill.
///
/// Hidden entirely when:
///  - the user is not logged in
///  - the API call fails (e.g. offline)
///  - the fetch is still in flight on first load
class QuotaBar extends ConsumerWidget {
  const QuotaBar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final usageAsync = ref.watch(quotaUsageProvider);

    return usageAsync.when(
      data: (usage) {
        if (usage == null) return const SizedBox.shrink();
        return _QuotaBarContent(usage: usage);
      },
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
    );
  }
}

class _QuotaBarContent extends StatelessWidget {
  final QuotaUsage usage;
  const _QuotaBarContent({required this.usage});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE5E7EB)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x14000000),
            blurRadius: 8,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.bolt_outlined,
                size: 18,
                color: Color(0xFF4F46E5),
              ),
              const SizedBox(width: 8),
              Text(
                'Daily quota · ${_planLabel(usage.plan)} plan',
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF1F2937),
                ),
              ),
              const Spacer(),
              Text(
                'Resets at midnight UTC',
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.grey[600],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _QuotaBarItem(
                  label: 'AI tools',
                  feature: usage.ai,
                  color: const Color(0xFF4F46E5),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _QuotaBarItem(
                  label: 'PDF processing',
                  feature: usage.process,
                  color: const Color(0xFF10B981),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  String _planLabel(String plan) {
    switch (plan.toLowerCase()) {
      case 'pro':
        return 'Pro';
      case 'business':
        return 'Business';
      case 'free':
      default:
        return 'Free';
    }
  }
}

class _QuotaBarItem extends StatelessWidget {
  final String label;
  final QuotaFeatureUsage feature;
  final Color color;

  const _QuotaBarItem({
    required this.label,
    required this.feature,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final unlimited = feature.unlimited;
    final valueText = unlimited
        ? 'Unlimited'
        : '${feature.used} / ${feature.limit}';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: Colors.grey[700],
              ),
            ),
            const Spacer(),
            Text(
              valueText,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: unlimited ? const Color(0xFF10B981) : Colors.grey[800],
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: SizedBox(
            height: 6,
            child: unlimited
                ? Container(color: const Color(0xFFD1FAE5))
                : LinearProgressIndicator(
                    value: feature.fraction,
                    backgroundColor: const Color(0xFFF3F4F6),
                    valueColor: AlwaysStoppedAnimation<Color>(color),
                  ),
          ),
        ),
      ],
    );
  }
}