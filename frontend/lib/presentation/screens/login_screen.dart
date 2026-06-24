import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../providers/auth_provider.dart';
import '../../core/api_client.dart';
import '../widgets/brand_logo.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _obscurePassword = true;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;

    final notifier = ref.read(authStateProvider.notifier);
    final mfaRequired = await notifier.login(
      _emailController.text.trim(),
      _passwordController.text,
    );

    if (!mounted) return;

    if (mfaRequired) {
      // The login API returned mfa_required=true. Pop a dialog asking
      // for the 6-digit code, then post it to /auth/2fa/verify.
      await _promptForMfaCode();
      return;
    }

    // If login succeeded, navigate to the `next` param (or /home).
    final state = ref.read(authStateProvider);
    if (state.value?.user != null && mounted) {
      final next = GoRouterState.of(context).uri.queryParameters['next'];
      if (next != null && next.isNotEmpty && next.startsWith('/')) {
        context.go(next);
      } else {
        context.go('/home');
      }
    }
  }

  /// Pop a 6-digit-code dialog. On success, AuthNotifier completes the
  /// login (issues the real tokens + sets user state) and we navigate.
  Future<void> _promptForMfaCode() async {
    final controller = TextEditingController();
    bool verifying = false;
    String? error;

    final ok = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) {
          return AlertDialog(
            title: const Text('Two-factor code'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Open your authenticator app and enter the 6-digit code '
                  'for ProPDFs.',
                  style: TextStyle(fontSize: 13),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: controller,
                  autofocus: true,
                  keyboardType: TextInputType.number,
                  maxLength: 6,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 8,
                  ),
                  decoration: const InputDecoration(
                    hintText: '000000',
                    counterText: '',
                    border: OutlineInputBorder(),
                  ),
                  onSubmitted: (_) => Navigator.of(ctx).pop(true),
                ),
                if (error != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    error!,
                    style: const TextStyle(
                        color: Color(0xFFEF4444), fontSize: 12),
                  ),
                ],
              ],
            ),
            actions: [
              TextButton(
                onPressed: verifying
                    ? null
                    : () => Navigator.of(ctx).pop(false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: verifying
                    ? null
                    : () async {
                        setLocal(() {
                          verifying = true;
                          error = null;
                        });
                        try {
                          final ok2 = await ref
                              .read(authStateProvider.notifier)
                              .verifyMfa(controller.text.trim());
                          if (mounted && ok2 && ctx.mounted) {
                            Navigator.of(ctx).pop(true);
                          } else if (ctx.mounted) {
                            setLocal(() {
                              verifying = false;
                              error =
                                  'That code didn\'t match. Try the next one.';
                            });
                          }
                        } catch (_) {
                          if (ctx.mounted) {
                            setLocal(() {
                              verifying = false;
                              error =
                                  'Verification failed. Try again.';
                            });
                          }
                        }
                      },
                child: verifying
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white),
                      )
                    : const Text('Verify'),
              ),
            ],
          );
        },
      ),
    );

    controller.dispose();

    if (!mounted) return;
    if (ok == true) {
      // Tokens + user state are set by verifyMfa. Navigate to next.
      final state = ref.read(authStateProvider);
      if (state.value?.user != null) {
        final next =
            GoRouterState.of(context).uri.queryParameters['next'];
        if (next != null && next.isNotEmpty && next.startsWith('/')) {
          context.go(next);
        } else {
          context.go('/home');
        }
      }
    }
  }

  Future<void> _loginWithGoogle() async {
    await _launchOAuth('google');
  }

  Future<void> _loginWithGitHub() async {
    await _launchOAuth('github');
  }

  Future<void> _launchOAuth(String provider) async {
    try {
      final uri = Uri.parse(ApiBaseUrl.oauthStart(provider));
      if (!await canLaunchUrl(uri)) {
        _showSnack('Could not open $provider sign-in. Check your popup blocker.');
        return;
      }
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (e) {
      // Surface the failure — silent failures on OAuth buttons left users
      // wondering why nothing happened.
      _showSnack('Sign-in with $provider failed: $e');
    }
  }

  Future<void> _loginWithMagicLink() async {
    final email = _emailController.text.trim();
    if (email.isEmpty || !email.contains('@')) {
      _showSnack('Enter your email above first — we\'ll send the link there.');
      return;
    }
    try {
      await ref.read(apiClientProvider).post(
            '/api/v1/auth/magic-link',
            data: {'email': email},
          );
      _showSnack('Sign-in link sent to $email. Check your inbox.');
    } on DioException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              e.response?.statusCode == 404
                  ? 'Magic link sign-in isn\'t enabled on the backend yet. '
                      'Use email + password or OAuth for now.'
                  : 'Failed to send link: ${e.response?.data?['detail'] ?? e.message}',
            ),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 5),
          ),
        );
      }
    } catch (e) {
      _showSnack('Network error: $e');
    }
  }

  void _showSnack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  void _showPasskeyComingSoon() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Passkey support coming soon!')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authStateProvider);
    final isLoading = authState.value?.isLoading ?? false;
    final error = authState.value?.error;

    return Scaffold(
      backgroundColor: const Color(0xFF0a0a0f),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0a0a0f),
        elevation: 0,
        title: const BrandLogo.inline(
          height: 24,
          textSize: 18,
          fontWeight: FontWeight.w800,
        ),
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      // The body has to be a layout widget that gives its child a definite
      // width (SingleChildScrollView expands horizontally inside Scaffold).
      // Putting Center/SafeArea between Scaffold and the scroll view made
      // the canvas collapse to 0×0 in Flutter web. Same fix as the home
      // screen: SingleChildScrollView is the direct child of Scaffold body.
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 400),
            child: Form(
              key: _formKey,
              child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        // Title
                        const Text(
                          'Welcome back',
                          style: TextStyle(
                            fontSize: 32,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                            letterSpacing: -0.5,
                          ),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Sign in to continue using ProPDFs.',
                          style: TextStyle(
                            fontSize: 16,
                            color: Colors.grey[400],
                          ),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 32),

                        // Passkey button
                        _SocialButton(
                          onPressed: _showPasskeyComingSoon,
                          icon: Icons.key_outlined,
                          label: 'Sign in with passkey',
                        ),
                        const SizedBox(height: 12),

                        // Google button
                        _BrandButton(
                          onPressed: _loginWithGoogle,
                          brand: 'google',
                          label: 'Continue with Google',
                        ),
                        const SizedBox(height: 12),

                        // GitHub button
                        _BrandButton(
                          onPressed: _loginWithGitHub,
                          brand: 'github',
                          label: 'Continue with GitHub',
                        ),
                        const SizedBox(height: 24),

                        // Divider
                        Row(
                          children: [
                            Expanded(child: Divider(color: Colors.grey[800])),
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 16),
                              child: Text(
                                'or with email',
                                style: TextStyle(color: Colors.grey[500], fontSize: 14),
                              ),
                            ),
                            Expanded(child: Divider(color: Colors.grey[800])),
                          ],
                        ),
                        const SizedBox(height: 16),

                        // Magic link — sends a one-time login link to the
                        // user's email instead of typing a password. Useful
                        // for users on shared devices, or as a passwordless
                        // option for the security-conscious.
                        OutlinedButton.icon(
                          onPressed: isLoading ? null : _loginWithMagicLink,
                          icon: const Icon(Icons.mail_outline, size: 18),
                          label: const Text('Email me a sign-in link'),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: Colors.white,
                            side: BorderSide(color: Colors.grey[700]!),
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                            minimumSize: const Size(double.infinity, 48),
                          ),
                        ),
                        const SizedBox(height: 16),

                        // Error message
                        if (error != null) ...[
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: const Color(0xFFEF4444).withOpacity(0.1),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: const Color(0xFFEF4444).withOpacity(0.3)),
                            ),
                            child: Text(
                              error,
                              style: const TextStyle(color: Color(0xFFEF4444)),
                            ),
                          ),
                          const SizedBox(height: 16),
                        ],

                        // Email label
                        Text(
                          'Email',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w500,
                            color: Colors.grey[300],
                          ),
                        ),
                        const SizedBox(height: 8),
                        TextFormField(
                          controller: _emailController,
                          keyboardType: TextInputType.emailAddress,
                          style: const TextStyle(color: Colors.white),
                          decoration: InputDecoration(
                            hintText: 'you@example.com',
                            hintStyle: TextStyle(color: Colors.grey[600]),
                            prefixIcon: Icon(Icons.email_outlined, color: Colors.grey[500]),
                            filled: true,
                            fillColor: const Color(0xFF1a1a2e),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: BorderSide(color: Colors.grey[800]!),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: BorderSide(color: Colors.grey[800]!),
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: const BorderSide(color: Color(0xFF2563EB), width: 2),
                            ),
                            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                          ),
                          validator: (value) {
                            if (value == null || value.isEmpty) return 'Email is required';
                            if (!value.contains('@')) return 'Enter a valid email';
                            return null;
                          },
                        ),
                        const SizedBox(height: 20),

                        // Password label
                        Text(
                          'Password',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w500,
                            color: Colors.grey[300],
                          ),
                        ),
                        const SizedBox(height: 8),
                        TextFormField(
                          controller: _passwordController,
                          obscureText: _obscurePassword,
                          style: const TextStyle(color: Colors.white),
                          decoration: InputDecoration(
                            hintText: 'At least 6 characters',
                            hintStyle: TextStyle(color: Colors.grey[600]),
                            prefixIcon: Icon(Icons.lock_outlined, color: Colors.grey[500]),
                            suffixIcon: IconButton(
                              icon: Icon(
                                _obscurePassword ? Icons.visibility_off : Icons.visibility,
                                color: Colors.grey[500],
                              ),
                              onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                            ),
                            filled: true,
                            fillColor: const Color(0xFF1a1a2e),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: BorderSide(color: Colors.grey[800]!),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: BorderSide(color: Colors.grey[800]!),
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: const BorderSide(color: Color(0xFF2563EB), width: 2),
                            ),
                            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                          ),
                          validator: (value) {
                            if (value == null || value.isEmpty) return 'Password is required';
                            if (value.length < 6) return 'Password must be at least 6 characters';
                            return null;
                          },
                        ),
                        const SizedBox(height: 8),

                        // Forgot password — right-aligned, secondary action.
                        Align(
                          alignment: Alignment.centerRight,
                          child: TextButton(
                            onPressed: () => context.go('/forgot-password'),
                            style: TextButton.styleFrom(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              minimumSize: Size.zero,
                              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            ),
                            child: const Text(
                              'Forgot password?',
                              style: TextStyle(
                                color: Color(0xFF2563EB),
                                fontSize: 14,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 8),

                        // Sign in button
                        SizedBox(
                          height: 52,
                          child: ElevatedButton(
                            onPressed: isLoading ? null : _login,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF2563EB),
                              foregroundColor: Colors.white,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              elevation: 0,
                            ),
                            child: isLoading
                                ? const SizedBox(
                                    height: 20,
                                    width: 20,
                                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                  )
                                : const Text(
                                    'Sign in',
                                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                                  ),
                          ),
                        ),
                        const SizedBox(height: 24),

                        // Sign up link — Wrap instead of Row so long
                        // translations (German / Russian) don't overflow.
                        Wrap(
                          alignment: WrapAlignment.center,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            Text(
                              "Don't have an account? ",
                              style: TextStyle(color: Colors.grey[500], fontSize: 14),
                            ),
                            GestureDetector(
                              onTap: () => context.go('/register'),
                              child: const Text(
                                'Sign up',
                                style: TextStyle(
                                  color: Color(0xFF2563EB),
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ));
  }
}

class _SocialButton extends StatelessWidget {
  final VoidCallback onPressed;
  final IconData icon;
  final String label;

  const _SocialButton({
    required this.onPressed,
    required this.icon,
    required this.label,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 48,
      child: OutlinedButton.icon(
        onPressed: onPressed,
        icon: Icon(icon, size: 20, color: Colors.white),
        label: Text(
          label,
          style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w500),
        ),
        style: OutlinedButton.styleFrom(
          backgroundColor: const Color(0xFF1a1a2e),
          side: BorderSide(color: Colors.grey[800]!),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          padding: const EdgeInsets.symmetric(horizontal: 16),
        ),
      ),
    );
  }
}

class _BrandButton extends StatelessWidget {
  final VoidCallback onPressed;
  final String brand;
  final String label;

  const _BrandButton({
    required this.onPressed,
    required this.brand,
    required this.label,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 48,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          backgroundColor: const Color(0xFF1a1a2e),
          side: BorderSide(color: Colors.grey[800]!),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          padding: const EdgeInsets.symmetric(horizontal: 16),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _BrandIcon(brand: brand),
            const SizedBox(width: 10),
            Text(
              label,
              style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w500),
            ),
          ],
        ),
      ),
    );
  }
}

class _BrandIcon extends StatelessWidget {
  final String brand;

  const _BrandIcon({required this.brand});

  @override
  Widget build(BuildContext context) {
    if (brand == 'google') {
      return _GoogleIcon();
    }
    if (brand == 'github') {
      return _GitHubIcon();
    }
    return const SizedBox.shrink();
  }
}

class _GoogleIcon extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    // Multi-colour Google "G" — the official 4-colour brand mark
    // (blue / green / yellow / red). No tinting at the call site;
    // the SVG ships with the brand colours baked in.
    return SvgPicture.asset(
      'assets/oauth/google.svg',
      width: 20,
      height: 20,
    );
  }
}

class _GitHubIcon extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    // GitHub Octocat mark, single-colour. Always white because
    // the OAuth button background is dark; the white-on-dark
    // matches the screenshot design.
    return SvgPicture.asset(
      'assets/oauth/github.svg',
      width: 20,
      height: 20,
      colorFilter: const ColorFilter.mode(
        Colors.white,
        BlendMode.srcIn,
      ),
    );
  }
}
