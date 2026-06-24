import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api_client.dart';
import '../providers/auth_provider.dart';
import '../widgets/app_header.dart';
import '../widgets/oauth_buttons.dart';
import '../widgets/password_strength_meter.dart';
import '../widgets/turnstile_widget.dart';

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _obscurePassword = true;
  bool _agreeToTerms = false;
  // Live password evaluation — updated by the [PasswordStrengthChecker]
  // as the user types. Used to drive the submit button's enabled
  // state and to surface "breached" copy in the validator.
  PasswordEvaluation? _passwordEvaluation;

  /// Most recent Turnstile token. Empty string until the user finishes
  /// the challenge (or forever, on dev/mobile builds where Turnstile is
  /// off). Backend treats empty + disabled as a no-op.
  String _turnstileToken = '';

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  void _onTurnstileToken(String token) {
    if (!mounted) return;
    setState(() {
      _turnstileToken = token;
    });
  }

  Future<void> _register() async {
    if (!_formKey.currentState!.validate()) return;
    if (!(_passwordEvaluation?.isAcceptable ?? false)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please address the password requirements below.'),
        ),
      );
      return;
    }
    if (!_agreeToTerms) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please agree to the terms and conditions')),
      );
      return;
    }

    final notifier = ref.read(authStateProvider.notifier);
    await notifier.register(
      _emailController.text.trim(),
      _passwordController.text,
      fullName: _nameController.text.trim(),
      turnstileToken: _turnstileToken,
    );
  }

  // -------- OAuth / passkey handlers --------
  //
  // We mirror the login page's OAuth flow on register so the
  // first-run experience is identical. The backend supports the
  // /api/v1/auth/{provider}/login start endpoint either way
  // — register just routes the user into a separate flow that
  // collects the rest of the profile after OAuth.

  Future<void> _registerWithGoogle() async {
    await _launchOAuth('google');
  }

  Future<void> _registerWithGitHub() async {
    await _launchOAuth('github');
  }

  Future<void> _launchOAuth(String provider) async {
    try {
      final uri = Uri.parse(ApiBaseUrl.oauthStart(provider));
      if (!await canLaunchUrl(uri)) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not open $provider sign-in.')),
        );
        return;
      }
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Sign-up with $provider failed: $e')),
      );
    }
  }

  void _showPasskeyComingSoon() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Passkey registration is coming soon. '
            'Use Google or GitHub for now.'),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authStateProvider);
    final isLoading = authState.value?.isLoading ?? false;
    final error = authState.value?.error;

    return Scaffold(
      backgroundColor: const Color(0xFF0a0a0f),
      appBar: const AppHeader(showSignIn: false),
      body: Column(
        children: [
          Expanded(
            child: SafeArea(
              child: Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 400),
                    child: Form(
                      key: _formKey,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const Text(
                            'Create account',
                            style: TextStyle(
                              fontSize: 32,
                              fontWeight: FontWeight.w700,
                            color: Colors.white,
                            letterSpacing: -0.5,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Start processing your documents for free.',
                          style: TextStyle(
                            fontSize: 16,
                            color: Colors.grey[400],
                          ),
                        ),
                        const SizedBox(height: 32),

                  // ---- OAuth stack (mirrors login page) ----
                  // Passkey first (matches the screenshot design),
                  // then Google, then GitHub. Each opens the
                  // provider's OAuth flow in a new tab; the
                  // callback returns to /oauth/callback and
                  // finishes setup.
                  SocialButton(
                    onPressed: _showPasskeyComingSoon,
                    icon: Icons.key_outlined,
                    label: 'Sign up with passkey',
                  ),
                  const SizedBox(height: 12),
                  BrandButton(
                    onPressed: _registerWithGoogle,
                    brand: BrandKind.google,
                    label: 'Continue with Google',
                  ),
                  const SizedBox(height: 12),
                  BrandButton(
                    onPressed: _registerWithGitHub,
                    brand: BrandKind.github,
                    label: 'Continue with GitHub',
                  ),
                  const SizedBox(height: 24),
                  const AuthDivider(),
                  const SizedBox(height: 16),

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

                  _buildLabel('Full Name'),
                  _buildTextField(
                    controller: _nameController,
                    hint: 'John Doe',
                    icon: Icons.person_outline,
                  ),
                  const SizedBox(height: 20),

                  _buildLabel('Email'),
                  _buildTextField(
                    controller: _emailController,
                    hint: 'you@example.com',
                    icon: Icons.email_outlined,
                    keyboardType: TextInputType.emailAddress,
                    validator: (value) {
                      if (value == null || value.isEmpty) return 'Email is required';
                      if (!value.contains('@')) return 'Enter a valid email';
                      return null;
                    },
                  ),
                  const SizedBox(height: 20),

                  _buildLabel('Password'),
                  _buildTextField(
                    controller: _passwordController,
                    hint: 'At least 8 characters, 1 number, 1 capital, 1 symbol',
                    icon: Icons.lock_outlined,
                    obscureText: _obscurePassword,
                    suffixIcon: IconButton(
                      icon: Icon(
                        _obscurePassword ? Icons.visibility_off : Icons.visibility,
                        color: Colors.grey[500],
                      ),
                      onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                    ),
                    validator: (value) {
                      if (value == null || value.isEmpty) {
                        return 'Password is required';
                      }
                      if (value.length < 8) {
                        return 'Password must be at least 8 characters';
                      }
                      if (!RegExp(r'[A-Z]').hasMatch(value)) {
                        return 'Add at least 1 uppercase letter';
                      }
                      if (!RegExp(r'[0-9]').hasMatch(value)) {
                        return 'Add at least 1 number';
                      }
                      if (!RegExp(
                              r'''[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?`~]''')
                          .hasMatch(value)) {
                        return 'Add at least 1 special character (!@#\$%^&*...)';
                      }
                      // Reject if breach-checked and breached.
                      if (_passwordEvaluation != null &&
                          _passwordEvaluation!.breachChecked &&
                          (_passwordEvaluation!.breachCount ?? 0) > 0) {
                        return 'This password was found in a known breach — pick another';
                      }
                      return null;
                    },
                  ),
                  // Live password strength meter. Hidden until the user
                  // starts typing so we don't show an empty bar.
                  if (_passwordController.text.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    PasswordStrengthChecker(
                      passwordController: _passwordController,
                      onChanged: (eval) {
                        // Keep our parent's `_passwordEvaluation` in
                        // sync so the submit button + validator can
                        // react to changes (e.g. disable submit until
                        // `isAcceptable`).
                        if (mounted) {
                          setState(() => _passwordEvaluation = eval);
                        }
                      },
                    ),
                  ],
                  const SizedBox(height: 20),

                  _buildLabel('Confirm Password'),
                  _buildTextField(
                    controller: _confirmController,
                    hint: 'Re-enter your password',
                    icon: Icons.lock_outline,
                    obscureText: _obscurePassword,
                    validator: (value) {
                      if (value != _passwordController.text) {
                        return 'Passwords do not match';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 16),

                  Row(
                    children: [
                      Checkbox(
                        value: _agreeToTerms,
                        onChanged: (v) => setState(() => _agreeToTerms = v ?? false),
                        fillColor: WidgetStateProperty.resolveWith((states) {
                          if (states.contains(WidgetState.selected)) {
                            return const Color(0xFF2563EB);
                          }
                          return Colors.grey[800];
                        }),
                      ),
                      Expanded(
                        child: Wrap(
                          children: [
                            const Text(
                              'I agree to the ',
                              style: TextStyle(
                                fontSize: 13,
                                color: Color(0xFF9CA3AF),
                              ),
                            ),
                            InkWell(
                              onTap: () => context.go('/terms'),
                              child: const Text(
                                'Terms of Service',
                                style: TextStyle(
                                  fontSize: 13,
                                  color: Color(0xFF60A5FA),
                                  decoration: TextDecoration.underline,
                                ),
                              ),
                            ),
                            const Text(
                              ' and ',
                              style: TextStyle(
                                fontSize: 13,
                                color: Color(0xFF9CA3AF),
                              ),
                            ),
                            InkWell(
                              onTap: () => context.go('/privacy'),
                              child: const Text(
                                'Privacy Policy',
                                style: TextStyle(
                                  fontSize: 13,
                                  color: Color(0xFF60A5FA),
                                  decoration: TextDecoration.underline,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),

                  // Cloudflare Turnstile widget. Renders only on
                  // Flutter web when the site key is configured;
                  // short-circuits to an empty token otherwise. The
                  // backend's TURNSTILE_ENABLED flag is the source
                  // of truth — both must agree before any challenge
                  // runs.
                  if (kIsWeb) ...[
                    TurnstileWidget(
                      siteKey: TurnstileConfig.siteKey,
                      enabled: TurnstileConfig.enabled,
                      onToken: _onTurnstileToken,
                    ),
                    const SizedBox(height: 16),
                  ],

                  SizedBox(
                    height: 52,
                    child: ElevatedButton(
                      // Disabled until the password passes every
                      // structural rule + the breach check. The
                      // HIBP check is async; while it's in-flight
                      // we keep the button disabled so users don't
                      // submit a breached password in the brief
                      // window before the result comes back.
                      onPressed: (isLoading ||
                              !(_passwordEvaluation?.isAcceptable ?? false))
                          ? null
                          : _register,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF2563EB),
                        foregroundColor: Colors.white,
                        disabledBackgroundColor: const Color(0xFF1f2937),
                        disabledForegroundColor: Colors.grey[500],
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
                              'Create account',
                              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                            ),
                    ),
                  ),
                  const SizedBox(height: 24),

                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text('Already have an account? ', style: TextStyle(color: Colors.grey[500])),
                      GestureDetector(
                        onTap: () => context.go('/login'),
                        child: const Text(
                          'Sign in',
                          style: TextStyle(
                            color: Color(0xFF2563EB),
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
      ),
    ),
  ),
  ],
  ),
);
  }

  Widget _buildLabel(String text) {
    return Text(
      text,
      style: TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w500,
        color: Colors.grey[300],
      ),
    );
  }

  Widget _buildTextField({
    required TextEditingController controller,
    required String hint,
    required IconData icon,
    TextInputType? keyboardType,
    bool obscureText = false,
    Widget? suffixIcon,
    String? Function(String?)? validator,
  }) {
    return TextFormField(
      controller: controller,
      keyboardType: keyboardType,
      obscureText: obscureText,
      style: const TextStyle(color: Colors.white),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: TextStyle(color: Colors.grey[600]),
        prefixIcon: Icon(icon, color: Colors.grey[500]),
        suffixIcon: suffixIcon,
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
      validator: validator,
    );
  }
}
