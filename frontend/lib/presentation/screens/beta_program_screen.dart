import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/localization/app_localizations.dart';
import '../providers/auth_provider.dart';
import '../widgets/app_footer.dart';

class BetaProgramScreen extends ConsumerStatefulWidget {
  const BetaProgramScreen({super.key});

  @override
  ConsumerState<BetaProgramScreen> createState() => _BetaProgramScreenState();
}

class _BetaProgramScreenState extends ConsumerState<BetaProgramScreen> {
  bool _isLoading = false;
  bool _isEnrolled = false;
  String? _enrolledReferralCode;
  DateTime? _betaExpiresAt;

  int? _remainingSlots;
  int? _maxUsers;

  final TextEditingController _referralController = TextEditingController();
  final TextEditingController _feedbackController = TextEditingController();
  int _feedbackRating = 0;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  @override
  void dispose() {
    _referralController.dispose();
    _feedbackController.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    // Public status is always fetchable.
    final dio = ref.read(apiClientProvider);
    try {
      final resp = await dio.get('/api/v1/beta/status');
      if (mounted && resp.data is Map<String, dynamic>) {
        setState(() {
          _remainingSlots = resp.data['remaining_slots'] as int?;
          _maxUsers = resp.data['max_users'] as int?;
        });
      }
    } catch (_) {
      // Backend offline — degrade gracefully, just hide slot counter.
    }

    // My-status requires auth.
    final auth = ref.read(authStateProvider).value;
    if (auth?.user != null) {
      try {
        final resp = await dio.get('/api/v1/beta/my-status');
        if (mounted && resp.data is Map<String, dynamic>) {
          setState(() {
            _isEnrolled = resp.data['is_active'] == true;
            _enrolledReferralCode =
                resp.data['referral_code'] as String?;
            final exp = resp.data['beta_expires_at'] as String?;
            if (exp != null) _betaExpiresAt = DateTime.tryParse(exp);
          });
        }
      } catch (_) {
        // Not enrolled or endpoint rejected — keep `_isEnrolled = false`.
      }
    }
  }

  Future<void> _enrollBeta() async {
    final auth = ref.read(authStateProvider).value;
    if (auth?.user == null) {
      context.go('/login');
      return;
    }

    setState(() => _isLoading = true);
    try {
      final dio = ref.read(apiClientProvider);
      final resp = await dio.post('/api/v1/beta/enroll');
      if (!mounted) return;

      final data = resp.data as Map<String, dynamic>;
      final status = data['status'] as Map<String, dynamic>?;
      setState(() {
        _isEnrolled = true;
        _enrolledReferralCode = data['referral_code'] as String?;
        if (status?['beta_expires_at'] != null) {
          _betaExpiresAt = DateTime.tryParse(status!['beta_expires_at'] as String);
        }
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(data['message'] as String? ?? 'Welcome to the ProPDFs Beta!'),
          backgroundColor: Colors.green,
        ),
      );
    } on DioException catch (e) {
      _showError(e.response?.data?['detail'] ?? e.message ?? 'Enrollment failed');
    } catch (e) {
      _showError(e.toString());
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _submitFeedback() async {
    if (_feedbackRating == 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select a rating')),
      );
      return;
    }
    setState(() => _isLoading = true);
    try {
      final dio = ref.read(apiClientProvider);
      await dio.post(
        '/api/v1/beta/feedback',
        queryParameters: {
          'rating': _feedbackRating,
          'feedback': _feedbackController.text,
        },
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Thank you for your feedback!'),
          backgroundColor: Colors.green,
        ),
      );
      setState(() {
        _feedbackController.clear();
        _feedbackRating = 0;
      });
    } on DioException catch (e) {
      _showError(e.response?.data?['detail'] ?? e.message ?? 'Feedback failed');
    } catch (e) {
      _showError(e.toString());
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _useReferralCode() async {
    final code = _referralController.text.trim();
    if (code.isEmpty) return;
    setState(() => _isLoading = true);
    try {
      final dio = ref.read(apiClientProvider);
      await dio.post('/api/v1/beta/referral/$code');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Referral code applied!'),
          backgroundColor: Colors.green,
        ),
      );
      _referralController.clear();
    } on DioException catch (e) {
      _showError(e.response?.data?['detail'] ?? e.message ?? 'Referral failed');
    } catch (e) {
      _showError(e.toString());
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _showError(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: Colors.red),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final auth = ref.watch(authStateProvider).value;
    final isAuthenticated = auth?.user != null;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.get('beta_program'))),
      bottomNavigationBar: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(color: const Color(0xFF0a0a0f), height: 1),
          const AppFooter(),
        ],
      ),
      body: _isEnrolled
          ? _buildEnrolledView(l10n)
          : _buildEnrollView(l10n, isAuthenticated),
    );
  }

  Widget _buildEnrollView(AppLocalizations l10n, bool isAuthenticated) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.primaryContainer,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Icon(Icons.rocket_launch,
                size: 40, color: Theme.of(context).colorScheme.primary),
          ),
          const SizedBox(height: 24),
          Text(
            l10n.get('beta_welcome'),
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text(
            l10n.get('beta_full_access'),
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Colors.grey[600],
                ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),
          if (_maxUsers != null && _remainingSlots != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.amber.shade50,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: Colors.amber.shade300),
              ),
              child: Text(
                '$_remainingSlots of $_maxUsers beta slots remaining',
                style: TextStyle(color: Colors.amber.shade900),
              ),
            ),
          const SizedBox(height: 24),
          _buildFeatureCard(
            Icons.picture_as_pdf,
            l10n.get('all_tools'),
            'Merge, split, compress, rotate, watermark, and more',
          ),
          _buildFeatureCard(
            Icons.transform,
            l10n.get('full_conversion'),
            'Convert between 30+ formats (Office, images, ebooks)',
          ),
          _buildFeatureCard(
            Icons.document_scanner,
            l10n.get('ocr'),
            'OCR scanned documents in 30+ languages',
          ),
          _buildFeatureCard(
            Icons.auto_awesome,
            l10n.get('ai_features'),
            'Summarize, translate, extract, chat with Gemini AI',
          ),
          const SizedBox(height: 32),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: _isLoading
                  ? null
                  : (isAuthenticated ? _enrollBeta : () => context.go('/login')),
              icon: _isLoading
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.rocket_launch),
              label: Text(isAuthenticated
                  ? l10n.get('beta_enroll')
                  : 'Sign in to enroll'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEnrolledView(AppLocalizations l10n) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [Colors.green.shade400, Colors.teal.shade400],
              ),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(
              children: [
                const Icon(Icons.verified, color: Colors.white, size: 32),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'You\'re in the ProPDFs Beta!',
                        style: TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _betaExpiresAt != null
                            ? 'Full access until ${_betaExpiresAt!.toLocal().toString().split(' ').first}'
                            : 'Full access granted',
                        style: const TextStyle(color: Colors.white70, fontSize: 12),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          Text(
            l10n.get('referral_code'),
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
          ),
          const SizedBox(height: 8),
          if (_enrolledReferralCode != null)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      _enrolledReferralCode!,
                      style: const TextStyle(
                          fontWeight: FontWeight.bold, fontSize: 18),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.copy),
                    onPressed: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('Copied: $_enrolledReferralCode')),
                      );
                    },
                  ),
                ],
              ),
            ),
          const SizedBox(height: 24),
          Text(
            l10n.get('feedback'),
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: List.generate(5, (i) {
              final rating = i + 1;
              return IconButton(
                iconSize: 32,
                icon: Icon(
                  rating <= _feedbackRating ? Icons.star : Icons.star_border,
                  color: Colors.amber,
                ),
                onPressed: () => setState(() => _feedbackRating = rating),
              );
            }),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _feedbackController,
            decoration: const InputDecoration(
              hintText: 'Tell us what you love or what needs fixing...',
              border: OutlineInputBorder(),
            ),
            maxLines: 4,
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _isLoading ? null : _submitFeedback,
              child: _isLoading
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : const Text('Submit feedback'),
            ),
          ),
          const SizedBox(height: 32),
          Text(
            'Have a referral code?',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _referralController,
                  decoration: const InputDecoration(
                    hintText: 'Enter referral code',
                    border: OutlineInputBorder(),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              FilledButton(
                onPressed: _isLoading ? null : _useReferralCode,
                child: const Text('Apply'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildFeatureCard(IconData icon, String title, String description) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.primaryContainer,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: Theme.of(context).colorScheme.primary, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(description,
                    style: TextStyle(
                        fontSize: 12, color: Colors.grey[600], height: 1.4)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
