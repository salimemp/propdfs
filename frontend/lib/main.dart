import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'router/app_router.dart';
import 'core/theme.dart';
import 'core/theme_provider.dart';
import 'core/localization/app_localizations.dart';
import 'core/accessibility/accessibility_provider.dart';
import 'presentation/widgets/cookie_consent_banner.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    const ProviderScope(
      child: ProPDFsApp(),
    ),
  );
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
        theme: ProPDFsTheme.lightTheme.copyWith(
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
        darkTheme: ProPDFsTheme.darkTheme,
        themeMode: themeSettings.flutterThemeMode,
        routerConfig: router,
        locale: const Locale('en'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        builder: (context, child) {
          return Stack(
            children: [
              child!,
              const Positioned(
                bottom: 0,
                left: 0,
                right: 0,
                child: CookieConsentBanner(),
              ),
            ],
          );
        },
      ),
    );
  }
}
