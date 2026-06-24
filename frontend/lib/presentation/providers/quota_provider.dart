import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';

/// Per-user daily quota usage for AI + PROCESS features. Backed by
/// GET /api/v1/auth/quota-usage on the backend; cached in a
/// [FutureProvider] so all widgets watching it share a single fetch.
class QuotaUsage {
  /// Plan tier: "free", "pro", or "business". Drives the display
  /// label and the upgrade CTA.
  final String plan;

  /// Calendar date the quota is measured against (server's local
  /// date in YYYY-MM-DD format). The counter rolls over at the
  /// configured timezone midnight on the backend.
  final String date;

  final QuotaFeatureUsage ai;

  final QuotaFeatureUsage process;

  const QuotaUsage({
    required this.plan,
    required this.date,
    required this.ai,
    required this.process,
  });

  factory QuotaUsage.fromJson(Map<String, dynamic> json) {
    final features = (json['features'] as Map?) ?? const {};
    return QuotaUsage(
      plan: json['plan'] as String? ?? 'free',
      date: json['date'] as String? ?? '',
      ai: QuotaFeatureUsage.fromJson(
        (features['ai'] as Map?)?.cast<String, dynamic>() ?? const {},
      ),
      process: QuotaFeatureUsage.fromJson(
        (features['process'] as Map?)?.cast<String, dynamic>() ?? const {},
      ),
    );
  }
}

/// One feature's quota — used, limit, and whether the limit is
/// "unlimited" (Pro / Business don't have a cap for some
/// operations, depending on plan).
class QuotaFeatureUsage {
  final int used;
  final int limit;

  /// True when the user has no per-day cap (e.g. Business plan).
  /// When true, the UI shows "Unlimited" instead of "X / Y".
  final bool unlimited;

  const QuotaFeatureUsage({
    required this.used,
    required this.limit,
    required this.unlimited,
  });

  factory QuotaFeatureUsage.fromJson(Map<String, dynamic> json) {
    return QuotaFeatureUsage(
      used: (json['used'] as num?)?.toInt() ?? 0,
      limit: (json['limit'] as num?)?.toInt() ?? 0,
      unlimited: json['unlimited'] as bool? ?? false,
    );
  }

  /// 0..1 fraction of the daily quota consumed. Returns 0 when
  /// unlimited (caller should special-case).
  double get fraction =>
      unlimited || limit == 0 ? 0 : (used / limit).clamp(0, 1).toDouble();
}

/// Provider that fetches the quota usage from the backend. Watches
/// [authStateProvider] indirectly: when the access token changes
/// the underlying Dio client uses it, so a successful login will
/// fetch the user's actual quota. While unauthenticated the API
/// returns 401 — we surface an empty default rather than throwing.
final quotaUsageProvider = FutureProvider<QuotaUsage?>((ref) async {
  try {
    final dio = ref.read(apiClientProvider);
    final resp = await dio.get('/api/v1/auth/quota-usage');
    if (resp.statusCode != 200 || resp.data == null) return null;
    return QuotaUsage.fromJson(
      (resp.data as Map).cast<String, dynamic>(),
    );
  } catch (_) {
    // Network failure or 401 — show no quota bar rather than an
    // error. The home page renders nothing in that case.
    return null;
  }
});