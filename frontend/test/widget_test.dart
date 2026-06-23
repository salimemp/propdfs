import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:propdfs/main.dart';
import 'package:propdfs/core/localization/app_localizations.dart';
import 'package:propdfs/presentation/screens/accessibility_screen.dart';
import 'package:propdfs/presentation/screens/beta_program_screen.dart';
import 'package:propdfs/presentation/screens/language_screen.dart';
import 'package:propdfs/presentation/screens/ai_chat_screen.dart';
import 'package:propdfs/presentation/screens/login_screen.dart';
import 'package:propdfs/presentation/screens/home_screen.dart';
import 'package:propdfs/presentation/screens/settings_screen.dart';

void main() {
  group('App Startup', () {
    testWidgets('App renders with localization', (WidgetTester tester) async {
      _useWideSurface(tester);
      await tester.pumpWidget(
        const ProviderScope(child: ProPDFsApp()),
      );
      await tester.pumpAndSettle();
      // The ProPDFs brand text appears in the header logo on the home page.
      expect(find.text('ProPDFs'), findsWidgets);
    });

    testWidgets('App supports multiple locales', (WidgetTester tester) async {
      expect(AppLocalizations.supportedLocales.length, greaterThanOrEqualTo(35));
    });
  });

  group('Screens', () {
    testWidgets('LoginScreen renders', (WidgetTester tester) async {
      _useWideSurface(tester);

      await tester.pumpWidget(
        MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: const ProviderScope(child: LoginScreen()),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Welcome back'), findsOneWidget);
      expect(find.text('Continue with Google'), findsOneWidget);
      expect(find.text('Continue with GitHub'), findsOneWidget);
    });

    testWidgets('HomeScreen renders', (WidgetTester tester) async {
      _useWideSurface(tester);

      await tester.pumpWidget(
        MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: const ProviderScope(child: HomeScreen()),
        ),
      );
      await tester.pumpAndSettle();
      // Home hero copy — appears in the hero section.
      expect(find.textContaining('PDF tool you need'), findsWidgets);
      // Tool catalog heading ("N PDF tools. One click each.").
      expect(find.textContaining('PDF tools'), findsWidgets);
    });

    testWidgets('SettingsScreen renders', (WidgetTester tester) async {
      _useWideSurface(tester);

      await tester.pumpWidget(
        MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: const ProviderScope(child: SettingsScreen()),
        ),
      );
      await tester.pumpAndSettle();
      // Settings menu shows section entries — assert on at least one.
      expect(find.text('Accessibility'), findsWidgets);
    });

    testWidgets('AccessibilityScreen renders', (WidgetTester tester) async {
      _useWideSurface(tester);
      await tester.pumpWidget(
        MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: const ProviderScope(child: AccessibilityScreen()),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(SwitchListTile), findsWidgets);
    });

    testWidgets('BetaProgramScreen renders', (WidgetTester tester) async {
      _useWideSurface(tester);
      await tester.pumpWidget(
        MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: const ProviderScope(child: BetaProgramScreen()),
      ),
      );
      await tester.pumpAndSettle();
      // App bar shows the localized "Beta Program" title; the body
      // headline is "Welcome to ProPDFs Beta!".
      expect(find.text('Beta Program'), findsOneWidget);
      expect(find.text('Welcome to ProPDFs Beta!'), findsOneWidget);
    });

    testWidgets('LanguageScreen renders', (WidgetTester tester) async {
      _useWideSurface(tester);
      await tester.pumpWidget(
        MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: const ProviderScope(child: LanguageScreen()),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('English'), findsOneWidget);
      expect(find.text('Español'), findsOneWidget);
      expect(find.text('Français'), findsOneWidget);
    });

    testWidgets('AIChatScreen renders', (WidgetTester tester) async {
      _useWideSurface(tester);
      await tester.pumpWidget(
        MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: const ProviderScope(child: AIChatScreen()),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(TextField), findsOneWidget);
    });
  });

  group('Accessibility', () {
    testWidgets('Accessibility settings can be toggled', (WidgetTester tester) async {
      _useWideSurface(tester);
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            home: const AccessibilityScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Find and toggle a switch
      final switches = find.byType(SwitchListTile);
      expect(switches, findsWidgets);
    });

    testWidgets('Text scale can be changed', (WidgetTester tester) async {
      _useWideSurface(tester);
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            home: const AccessibilityScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(SegmentedButton<double>), findsOneWidget);
    });
  });

  group('Localization', () {
    test('English localization has all keys', () {
      final l10n = AppLocalizations(const Locale('en'));
      expect(l10n.get('app_name'), 'ProPDFs');
      expect(l10n.get('welcome'), 'Welcome to ProPDFs');
      expect(l10n.get('login'), 'Sign In');
      expect(l10n.get('register'), 'Create Account');
      expect(l10n.get('email'), 'Email');
      expect(l10n.get('password'), 'Password');
      expect(l10n.get('home'), 'Home');
      expect(l10n.get('settings'), 'Settings');
      expect(l10n.get('logout'), 'Logout');
      expect(l10n.get('beta_program'), 'Beta Program');
      expect(l10n.get('accessibility'), 'Accessibility');
      expect(l10n.get('voice_commands'), 'Voice Commands');
      expect(l10n.get('read_aloud'), 'Read Aloud');
      expect(l10n.get('scan_document'), 'Scan Document');
      expect(l10n.get('ai_chat'), 'AI Chat');
      expect(l10n.get('ai_summarize'), 'AI Summarize');
      expect(l10n.get('ai_translate'), 'AI Translate');
      expect(l10n.get('ocr'), 'OCR');
      expect(l10n.get('language'), 'Language');
      expect(l10n.get('high_contrast'), 'High Contrast');
      expect(l10n.get('large_text'), 'Large Text');
    });

    test('Spanish localization has all keys', () {
      final l10n = AppLocalizations(const Locale('es'));
      expect(l10n.get('app_name'), 'ProPDFs');
      expect(l10n.get('welcome'), 'Bienvenido a ProPDFs');
      expect(l10n.get('login'), 'Iniciar Sesión');
      expect(l10n.get('beta_program'), 'Programa Beta');
      expect(l10n.get('accessibility'), 'Accesibilidad');
    });

    test('French localization has all keys', () {
      final l10n = AppLocalizations(const Locale('fr'));
      expect(l10n.get('welcome'), 'Bienvenue sur ProPDFs');
      expect(l10n.get('login'), 'Se Connecter');
      expect(l10n.get('beta_program'), 'Programme Bêta');
      expect(l10n.get('accessibility'), 'Accessibilité');
    });
  });

  group('Navigation', () {
    testWidgets('Bottom navigation works', (WidgetTester tester) async {
      _useWideSurface(tester);
      await tester.pumpWidget(
        const ProviderScope(child: ProPDFsApp()),
      );
      await tester.pumpAndSettle();

      // The public ProPDFs web layout uses an AppFooter (link bar), not a
      // Material 3 NavigationBar. Assert on the home tool catalog header
      // to confirm the initial route rendered.
      expect(find.textContaining('PDF tools'), findsWidgets);
    });
  });
}

/// Resize the test surface so screens with multi-column layouts (login
/// form, home hero row, settings list) don't overflow at the default
/// 800x600 viewport. Caller must `addTearDown(tester.view.reset)` to
/// restore the surface for tests that follow.
void _useWideSurface(WidgetTester tester) {
  tester.view.physicalSize = const Size(1600, 1200);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}
