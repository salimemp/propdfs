import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

import '../presentation/screens/splash_screen.dart';
import '../presentation/screens/login_screen.dart';
import '../presentation/screens/register_screen.dart';
import '../presentation/screens/home_screen.dart';
import '../presentation/screens/document_list_screen.dart';
import '../presentation/screens/pdf_tools_screen.dart';
import '../presentation/screens/settings_screen.dart';
import '../presentation/screens/scan/document_scanner_screen.dart';
import '../presentation/screens/beta_program_screen.dart';
import '../presentation/screens/accessibility_screen.dart';
import '../presentation/screens/ai_chat_screen.dart';
import '../presentation/screens/language_screen.dart';
import '../presentation/screens/legal_screens.dart';
import '../presentation/screens/blog_screen.dart';
import '../presentation/screens/delete_account_screen.dart';
import '../presentation/screens/my_data_screen.dart';
import '../presentation/screens/pricing_screen.dart';
import '../presentation/screens/about_screen.dart';
import '../presentation/providers/auth_provider.dart';

import 'dart:async';

// Routes that require a signed-in user. Everything else is public.
// /tools is PUBLIC — anyone can use PDF tools without an account.
const _protectedRoutes = {
  '/documents',
  '/settings',
  '/scan',
  '/accessibility',
  '/ai-chat',
  '/language',
  '/delete-account',
  '/my-data',
};

// Routes where a signed-in user shouldn't sit (they'd just bounce to /home).
const _authOnlyRoutes = {'/login', '/register', '/auth/callback'};

bool _isProtected(String location) {
  // A path is protected if it equals one of the protected paths, or is a
  // sub-route (e.g. /tools/anything). We use startsWith rather than ==
  // because GoRouter matches longer paths against their parent.
  for (final p in _protectedRoutes) {
    if (location == p || location.startsWith('$p/')) return true;
  }
  return false;
}

bool _isAuthOnly(String location) => _authOnlyRoutes.contains(location);

final appRouterProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authStateProvider);

  return GoRouter(
    // Land on the public home page directly. No splash → no bounce.
    initialLocation: '/home',
    // SentryNavigatorObserver emits a breadcrumb on every route push/replace,
    // so when an error fires you can see the exact navigation path the user
    // took to reach it. No-op when Sentry isn't initialised.
    observers: [SentryNavigatorObserver()],
    redirect: (context, state) {
      final isAuthenticated = authState.value?.user != null;
      final location = state.matchedLocation;

      // Public pages: never redirect.
      if (!_isProtected(location) && !_isAuthOnly(location)) {
        return null;
      }

      // Protected page + not signed in → bounce to login (but remember where
      // they were going so we can resume after sign-in).
      if (_isProtected(location) && !isAuthenticated) {
        return '/login?next=${Uri.encodeComponent(location)}';
      }

      // Auth-only page (login/register) + already signed in → home.
      if (_isAuthOnly(location) && isAuthenticated) {
        return '/home';
      }

      return null;
    },
    routes: [
      GoRoute(
        // `/` is kept as a backward-compat alias — redirects to /home.
        path: '/',
        redirect: (context, state) => '/home',
      ),
      GoRoute(
        path: '/splash',
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/register',
        builder: (context, state) => const RegisterScreen(),
      ),
      GoRoute(
        path: '/auth/callback',
        builder: (context, state) {
          final accessToken = state.uri.queryParameters['access_token'];
          final refreshToken = state.uri.queryParameters['refresh_token'];
          return OAuthCallbackScreen(
            accessToken: accessToken,
            refreshToken: refreshToken,
          );
        },
      ),
      GoRoute(
        path: '/home',
        builder: (context, state) => const HomeScreen(),
      ),
      GoRoute(
        path: '/pricing',
        builder: (context, state) => const PricingScreen(),
      ),
      GoRoute(
        path: '/about',
        builder: (context, state) => const AboutScreen(),
      ),
      GoRoute(
        path: '/documents',
        builder: (context, state) => const DocumentListScreen(),
      ),
      GoRoute(
        // Public PDF tools catalog. `?tool=merge` query param pre-selects a tool.
        path: '/tools',
        builder: (context, state) => PdfToolsScreen(
          initialTool: state.uri.queryParameters['tool'],
        ),
      ),
      GoRoute(
        path: '/settings',
        builder: (context, state) => const SettingsScreen(),
      ),
      GoRoute(
        path: '/scan',
        builder: (context, state) => const DocumentScannerScreen(),
      ),
      GoRoute(
        path: '/beta',
        builder: (context, state) => const BetaProgramScreen(),
      ),
      GoRoute(
        path: '/accessibility',
        builder: (context, state) => const AccessibilityScreen(),
      ),
      GoRoute(
        path: '/ai-chat',
        builder: (context, state) => AIChatScreen(
          documentId: state.uri.queryParameters['doc'],
        ),
      ),
      GoRoute(
        path: '/language',
        builder: (context, state) => const LanguageScreen(),
      ),
      GoRoute(
        path: '/privacy-policy',
        builder: (context, state) => const PrivacyPolicyScreen(),
      ),
      GoRoute(
        path: '/terms-of-service',
        builder: (context, state) => const TermsOfServiceScreen(),
      ),
      GoRoute(
        path: '/cookie-policy',
        builder: (context, state) => const TermsOfServiceScreen(),
      ),
      GoRoute(
        path: '/blog',
        builder: (context, state) => const BlogScreen(),
      ),
      GoRoute(
        path: '/blog/:slug',
        builder: (context, state) => BlogDetailScreen(
          slug: state.pathParameters['slug']!,
        ),
      ),
      GoRoute(
        path: '/delete-account',
        builder: (context, state) => const DeleteAccountScreen(),
      ),
      GoRoute(
        path: '/my-data',
        builder: (context, state) => const MyDataScreen(),
      ),
    ],
  );
});

class OAuthCallbackScreen extends ConsumerStatefulWidget {
  final String? accessToken;
  final String? refreshToken;

  const OAuthCallbackScreen({
    super.key,
    this.accessToken,
    this.refreshToken,
  });

  @override
  ConsumerState<OAuthCallbackScreen> createState() => _OAuthCallbackScreenState();
}

class _OAuthCallbackScreenState extends ConsumerState<OAuthCallbackScreen> {
  String? _error;

  @override
  void initState() {
    super.initState();
    if (widget.accessToken != null && widget.refreshToken != null) {
      _handleOAuthCallback();
    } else {
      // No tokens in URL — provider rejected or user navigated here directly.
      _error = 'Missing authentication tokens. Please try signing in again.';
      // Bounce back to login after a moment.
      Future.delayed(const Duration(seconds: 2), () {
        if (mounted) context.go('/login');
      });
    }
  }

  Future<void> _handleOAuthCallback() async {
    try {
      await ref.read(authStateProvider.notifier).acceptTokens(
            accessToken: widget.accessToken!,
            refreshToken: widget.refreshToken!,
          );
      if (mounted) {
        context.go('/home');
      }
    } catch (e) {
      if (mounted) {
        setState(() => _error = 'Failed to complete sign in: $e');
        Future.delayed(const Duration(seconds: 3), () {
          if (mounted) context.go('/login');
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (_error == null) ...[
                const CircularProgressIndicator(),
                const SizedBox(height: 16),
                const Text('Completing sign in...'),
              ] else ...[
                const Icon(Icons.error_outline, color: Colors.red, size: 48),
                const SizedBox(height: 16),
                Text(
                  _error!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.red),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
