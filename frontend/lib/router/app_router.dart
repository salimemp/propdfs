import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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
import '../presentation/providers/auth_provider.dart';

import 'dart:async';

final appRouterProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authStateProvider);

  return GoRouter(
    initialLocation: '/',
    redirect: (context, state) {
      final isAuthenticated = authState.value?.user != null;
      final isAuthRoute = state.matchedLocation == '/login' || 
                          state.matchedLocation == '/register' ||
                          state.matchedLocation == '/auth/callback';

      if (!isAuthenticated && !isAuthRoute) {
        return '/login';
      }
      if (isAuthenticated && isAuthRoute) {
        return '/home';
      }
      return null;
    },
    routes: [
      GoRoute(
        path: '/',
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
        path: '/documents',
        builder: (context, state) => const DocumentListScreen(),
      ),
      GoRoute(
        path: '/tools',
        builder: (context, state) => const PdfToolsScreen(),
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
