import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';

import '../../core/api_client.dart';
import '../providers/auth_provider.dart';

class DeleteAccountScreen extends ConsumerStatefulWidget {
  const DeleteAccountScreen({super.key});

  @override
  ConsumerState<DeleteAccountScreen> createState() => _DeleteAccountScreenState();
}

class _DeleteAccountScreenState extends ConsumerState<DeleteAccountScreen> {
  final _emailController = TextEditingController();
  final _confirmController = TextEditingController();
  final _reasonController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _isLoading = false;
  bool _agreeToDelete = false;
  int _step = 1;

  @override
  void dispose() {
    _emailController.dispose();
    _confirmController.dispose();
    _reasonController.dispose();
    super.dispose();
  }

  void _nextStep() {
    if (_step == 1 && _formKey.currentState!.validate()) {
      setState(() => _step = 2);
    } else if (_step == 2) {
      setState(() => _step = 3);
    }
  }

  void _prevStep() {
    if (_step > 1) {
      setState(() => _step--);
    }
  }

  Future<void> _deleteAccount() async {
    if (!_agreeToDelete) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('You must confirm you understand the consequences')),
      );
      return;
    }

    setState(() => _isLoading = true);

    try {
      final dio = ref.read(apiClientProvider);
      await dio.post('/api/v1/legal/delete-account', data: {
        'confirm_email': _emailController.text.trim(),
        'confirm_text': 'DELETE MY ACCOUNT',
        'reason': _reasonController.text.isNotEmpty ? _reasonController.text : null,
      });

      setState(() => _step = 4);
    } on DioException catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.response?.data?['detail'] ?? 'Failed to initiate deletion. Please try again.'),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Delete Account'),
        backgroundColor: Colors.red[50],
        foregroundColor: Colors.red[700],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 600),
            child: _buildStepContent(),
          ),
        ),
      ),
    );
  }

  Widget _buildStepContent() {
    switch (_step) {
      case 1:
        return _buildStep1();
      case 2:
        return _buildStep2();
      case 3:
        return _buildStep3();
      case 4:
        return _buildStep4();
      default:
        return _buildStep1();
    }
  }

  Widget _buildStep1() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.red[50],
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.red[200]!),
          ),
          child: Row(
            children: [
              Icon(Icons.warning_amber, color: Colors.red[700]),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Account deletion is permanent and cannot be undone.',
                  style: TextStyle(
                    color: Colors.red[800],
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        Text(
          'Before you continue, please understand what will happen:',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 16),
        _buildConsequenceItem(
          Icons.delete_forever,
          'All your documents will be permanently deleted',
          'This includes uploaded files, converted documents, and any processed outputs.',
        ),
        _buildConsequenceItem(
          Icons.credit_card_off,
          'Active subscriptions will be cancelled',
          'Any paid subscriptions will be cancelled immediately. No refunds will be issued for partial billing periods.',
        ),
        _buildConsequenceItem(
          Icons.group_remove,
          'Team workspace data will be removed',
          'If you are a team owner, your team members will lose access to shared workspaces.',
        ),
        _buildConsequenceItem(
          Icons.api,
          'API keys will be revoked',
          'Any API keys associated with your account will be immediately invalidated.',
        ),
        _buildConsequenceItem(
          Icons.history,
          '30-day grace period',
          'Your account will be deactivated immediately, but we retain data for 30 days in case you change your mind. After 30 days, all data is permanently purged.',
        ),
        const SizedBox(height: 24),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: _nextStep,
            style: FilledButton.styleFrom(
              backgroundColor: Colors.red,
              foregroundColor: Colors.white,
            ),
            child: const Text('I understand, continue'),
          ),
        ),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton(
            onPressed: () => context.pop(),
            child: const Text('Cancel and keep my account'),
          ),
        ),
      ],
    );
  }

  Widget _buildStep2() {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Step 2: Verify your identity',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'For security, please confirm your account email address.',
            style: TextStyle(color: Colors.grey[600]),
          ),
          const SizedBox(height: 24),
          TextFormField(
            controller: _emailController,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(
              labelText: 'Account Email Address',
              prefixIcon: Icon(Icons.email_outlined),
            ),
            validator: (value) {
              if (value == null || value.isEmpty) return 'Email is required';
              if (!value.contains('@')) return 'Enter a valid email';
              return null;
            },
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _reasonController,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: 'Reason for leaving (optional)',
              hintText: 'Help us improve by sharing why you\'re leaving...',
              prefixIcon: Icon(Icons.feedback_outlined),
            ),
          ),
          const SizedBox(height: 24),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.amber[50],
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.amber[200]!),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.info, color: Colors.amber[700], size: 20),
                    const SizedBox(width: 8),
                    Text(
                      'Your data rights',
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        color: Colors.amber[800],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  'Before deleting, you can export all your personal data. Visit Settings > Data Privacy to download your data in JSON, CSV, or PDF format.',
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.amber[800],
                    height: 1.5,
                  ),
                ),
                const SizedBox(height: 8),
                TextButton(
                  onPressed: () => context.push('/settings'),
                  child: const Text('Go to Data Export'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: _prevStep,
                  child: const Text('Back'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  onPressed: _nextStep,
                  style: FilledButton.styleFrom(backgroundColor: Colors.red),
                  child: const Text('Continue'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStep3() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Step 3: Final confirmation',
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Type the confirmation phrase below to permanently delete your account.',
          style: TextStyle(color: Colors.grey[600]),
        ),
        const SizedBox(height: 24),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.grey[100],
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Type exactly: DELETE MY ACCOUNT',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _confirmController,
                decoration: const InputDecoration(
                  hintText: 'DELETE MY ACCOUNT',
                  border: OutlineInputBorder(),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        CheckboxListTile(
          value: _agreeToDelete,
          onChanged: (v) => setState(() => _agreeToDelete = v ?? false),
          title: const Text('I understand that this action is permanent and cannot be undone.'),
          controlAffinity: ListTileControlAffinity.leading,
        ),
        CheckboxListTile(
          value: _agreeToDelete,
          onChanged: (v) => setState(() => _agreeToDelete = v ?? false),
          title: const Text('I understand that all my documents, settings, and account data will be permanently deleted.'),
          controlAffinity: ListTileControlAffinity.leading,
        ),
        const SizedBox(height: 24),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: _prevStep,
                child: const Text('Back'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: FilledButton(
                onPressed: _isLoading ? null : _deleteAccount,
                style: FilledButton.styleFrom(backgroundColor: Colors.red),
                child: _isLoading
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Text('Permanently Delete Account'),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildStep4() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        const SizedBox(height: 48),
        Icon(
          Icons.check_circle_outline,
          size: 80,
          color: Colors.green[400],
        ),
        const SizedBox(height: 24),
        Text(
          'Account deletion initiated',
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
            fontWeight: FontWeight.bold,
          ),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 16),
        Text(
          'Your account has been scheduled for deletion. You have 30 days to change your mind. If you log in during this period, the deletion will be cancelled.',
          textAlign: TextAlign.center,
          style: TextStyle(color: Colors.grey[600], height: 1.5),
        ),
        const SizedBox(height: 24),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.green[50],
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.green[200]!),
          ),
          child: Column(
            children: [
              Text(
                'Deletion scheduled for:',
                style: TextStyle(color: Colors.green[800]),
              ),
              const SizedBox(height: 4),
              Text(
                '30 days from today',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  color: Colors.green[800],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 32),
        FilledButton(
          onPressed: () {
            ref.read(authStateProvider.notifier).logout();
            context.go('/login');
          },
          child: const Text('Return to Login'),
        ),
      ],
    );
  }

  Widget _buildConsequenceItem(IconData icon, String title, String description) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: Colors.red[50],
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: Colors.red[400], size: 20),
          ),
          const SizedBox(width: 12),
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
                    height: 1.5,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
