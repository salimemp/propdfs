import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_web_plugins/url_strategy.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

import 'router/app_router.dart';
import 'core/theme.dart';
import 'core/theme_provider.dart';
import 'core/localization/app_localizations.dart';
import 'core/accessibility/accessibility_provider.dart';

/// Sentry DSN. Pass via `--dart-define=SENTRY_DSN=...` at build time.
/// Empty in dev → Sentry is a no-op (SentryFlutter.init early-returns
/// when DSN is empty), so local builds and tests don't capture anything.
const String _sentryDsn = String.fromEnvironment('SENTRY_DSN', defaultValue: '');

/// Release tag. Pass via `--dart-define=APP_VERSION=...` in CI. Falls back
/// to the local pubspec version.
const String _appVersion = String.fromEnvironment(
  'APP_VERSION',
  defaultValue: '1.0.0+1',
);

/// Environment. Pass via `--dart-define=ENVIRONMENT=staging|production`.
const String _environment = String.fromEnvironment(
  'ENVIRONMENT',
  defaultValue: 'development',
);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Use path-based URLs (/blog, /pricing, /tools) instead of hash URLs
  // (/#/blog). Requires `frontend/web/_redirects` to send every unknown
  // path to /index.html so Cloudflare Pages doesn't 404 on a hard reload.
  if (kIsWeb) {
    usePathUrlStrategy();
  }

  // SentryFlutter.init early-returns when DSN is empty, so dev builds
  // (no --dart-define) work without any guard. The `beforeSend` filter
  // drops 4xx so we only see real bugs in the issue stream.
  await SentryFlutter.init(
    (options) {
      options.dsn = _sentryDsn;
      options.environment = _environment;
      options.release = 'propdfs@$_appVersion';
      options.tracesSampleRate = _environment == 'production' ? 0.1 : 0.0;
      options.attachStacktrace = true;
      options.sendDefaultPii = false;

      options.beforeSend = (SentryEvent event, {Hint? hint}) {
        // Drop 4xx API errors — those are user errors, not bugs. Keep 5xx
        // and any unhandled exception thrown inside the Flutter framework.
        final contexts = event.contexts;
        final response = contexts['response'];
        if (response != null) {
          final status = response['status_code'];
          if (status is int && status >= 400 && status < 500) {
            return null;
          }
        }
        return event;
      };
    },
    appRunner: () => runApp(
      const ProviderScope(
        child: ProPDFsApp(),
      ),
    ),
  );

  // In debug builds, print a one-liner so you can see whether Sentry is
  // wired up without opening the dashboard.
  if (kDebugMode) {
    debugPrint(
      '[sentry] dsn=${_sentryDsn.isEmpty ? "<disabled>" : "set"} '
      'env=$_environment release=propdfs@$_appVersion',
    );
  }
}

class ProPDFsApp extends ConsumerWidget {
  const ProPDFsApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);
    final accessibility = ref.watch(accessibilityProvider);
    final themeSettings = ref.watch(themeProvider);

    return MediaQuery(
      data: MediaQuery.of(context).copyWith(
        textScaler: TextScaler.linear(accessibility.textScale),
      ),
      child: MaterialApp.router(
        title: 'ProPDFs - Enterprise Document Processing Platform',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light().copyWith(
          colorScheme: accessibility.highContrast
              ? const ColorScheme.light(
                  primary: Colors.black,
                  onPrimary: Colors.white,
                  secondary: Colors.black,
                  onSecondary: Colors.white,
                  surface: Colors.white,
                  surfaceContainerHighest: Colors.white,
                  error: Colors.red,
                  onError: Colors.white,
                )
              : null,
        ),
        darkTheme: AppTheme.dark(),
        themeMode: themeSettings.flutterThemeMode,
        routerConfig: router,
        locale: const Locale('en'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
      ),
    );
  }
}
