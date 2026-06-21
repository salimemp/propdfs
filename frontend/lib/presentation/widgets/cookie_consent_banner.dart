import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

final cookieConsentProvider = StateNotifierProvider<CookieConsentNotifier, CookieConsentState>((ref) {
  return CookieConsentNotifier();
});

class CookieConsentState {
  final bool hasConsented;
  final bool essentialAccepted;
  final bool functionalAccepted;
  final bool analyticsAccepted;
  final bool advertisingAccepted;

  CookieConsentState({
    this.hasConsented = false,
    this.essentialAccepted = true,
    this.functionalAccepted = false,
    this.analyticsAccepted = false,
    this.advertisingAccepted = false,
  });

  CookieConsentState copyWith({
    bool? hasConsented,
    bool? essentialAccepted,
    bool? functionalAccepted,
    bool? analyticsAccepted,
    bool? advertisingAccepted,
  }) {
    return CookieConsentState(
      hasConsented: hasConsented ?? this.hasConsented,
      essentialAccepted: essentialAccepted ?? this.essentialAccepted,
      functionalAccepted: functionalAccepted ?? this.functionalAccepted,
      analyticsAccepted: analyticsAccepted ?? this.analyticsAccepted,
      advertisingAccepted: advertisingAccepted ?? this.advertisingAccepted,
    );
  }
}

class CookieConsentNotifier extends StateNotifier<CookieConsentState> {
  static const _prefsKey = 'cookie_consent';

  CookieConsentNotifier() : super(CookieConsentState()) {
    _loadConsent();
  }

  Future<void> _loadConsent() async {
    final prefs = await SharedPreferences.getInstance();
    final hasConsented = prefs.getBool('${_prefsKey}_has_consented') ?? false;
    if (hasConsented) {
      state = CookieConsentState(
        hasConsented: true,
        essentialAccepted: prefs.getBool('${_prefsKey}_essential') ?? true,
        functionalAccepted: prefs.getBool('${_prefsKey}_functional') ?? false,
        analyticsAccepted: prefs.getBool('${_prefsKey}_analytics') ?? false,
        advertisingAccepted: prefs.getBool('${_prefsKey}_advertising') ?? false,
      );
    }
  }

  Future<void> acceptAll() async {
    final newState = CookieConsentState(
      hasConsented: true,
      essentialAccepted: true,
      functionalAccepted: true,
      analyticsAccepted: true,
      advertisingAccepted: true,
    );
    state = newState;
    await _saveConsent(newState);
  }

  Future<void> acceptEssentialOnly() async {
    final newState = CookieConsentState(
      hasConsented: true,
      essentialAccepted: true,
      functionalAccepted: false,
      analyticsAccepted: false,
      advertisingAccepted: false,
    );
    state = newState;
    await _saveConsent(newState);
  }

  Future<void> saveCustomPreferences({
    required bool functional,
    required bool analytics,
    required bool advertising,
  }) async {
    final newState = CookieConsentState(
      hasConsented: true,
      essentialAccepted: true,
      functionalAccepted: functional,
      analyticsAccepted: analytics,
      advertisingAccepted: advertising,
    );
    state = newState;
    await _saveConsent(newState);
  }

  Future<void> _saveConsent(CookieConsentState consent) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('${_prefsKey}_has_consented', consent.hasConsented);
    await prefs.setBool('${_prefsKey}_essential', consent.essentialAccepted);
    await prefs.setBool('${_prefsKey}_functional', consent.functionalAccepted);
    await prefs.setBool('${_prefsKey}_analytics', consent.analyticsAccepted);
    await prefs.setBool('${_prefsKey}_advertising', consent.advertisingAccepted);
  }
}

class CookieConsentBanner extends ConsumerStatefulWidget {
  const CookieConsentBanner({super.key});

  @override
  ConsumerState<CookieConsentBanner> createState() => _CookieConsentBannerState();
}

class _CookieConsentBannerState extends ConsumerState<CookieConsentBanner> {
  bool _showDetails = false;

  @override
  Widget build(BuildContext context) {
    final consent = ref.watch(cookieConsentProvider);

    if (consent.hasConsented) return const SizedBox.shrink();

    return Container(
      color: Theme.of(context).colorScheme.surface,
      padding: const EdgeInsets.all(16),
      child: SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  Icons.cookie_outlined,
                  color: Theme.of(context).colorScheme.primary,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'We use cookies to enhance your experience',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              'We use essential cookies for functionality, optional cookies for analytics and personalized content. By continuing, you consent to our use of cookies.',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Colors.grey[600],
              ),
            ),
            const SizedBox(height: 12),
            if (_showDetails) _buildDetails(),
            Row(
              children: [
                TextButton(
                  onPressed: () => setState(() => _showDetails = !_showDetails),
                  child: Text(_showDetails ? 'Hide Details' : 'Customize'),
                ),
                const Spacer(),
                OutlinedButton(
                  onPressed: () => ref.read(cookieConsentProvider.notifier).acceptEssentialOnly(),
                  child: const Text('Essential Only'),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: () => ref.read(cookieConsentProvider.notifier).acceptAll(),
                  child: const Text('Accept All'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                TextButton(
                  onPressed: () => context.push('/privacy-policy'),
                  child: const Text('Privacy Policy'),
                ),
                TextButton(
                  onPressed: () => context.push('/terms-of-service'),
                  child: const Text('Terms of Service'),
                ),
                TextButton(
                  onPressed: () => context.push('/cookie-policy'),
                  child: const Text('Cookie Policy'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDetails() {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildCookieCategory(
            'Essential',
            'Required for the site to function. Cannot be disabled.',
            true,
            null,
          ),
          const Divider(),
          _buildCookieCategory(
            'Functional',
            'Remember your preferences (language, theme, accessibility).',
            false,
            (value) {},
          ),
          const Divider(),
          _buildCookieCategory(
            'Analytics',
            'Help us understand how visitors interact with our website.',
            false,
            (value) {},
          ),
          const Divider(),
          _buildCookieCategory(
            'Advertising',
            'Used to show you relevant advertisements (opt-in only).',
            false,
            (value) {},
          ),
        ],
      ),
    );
  }

  Widget _buildCookieCategory(
    String title,
    String description,
    bool isRequired,
    ValueChanged<bool>? onChanged,
  ) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 2),
                Text(
                  description,
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey[600],
                  ),
                ),
              ],
            ),
          ),
          Switch(
            value: isRequired,
            onChanged: isRequired ? null : onChanged,
          ),
        ],
      ),
    );
  }
}
