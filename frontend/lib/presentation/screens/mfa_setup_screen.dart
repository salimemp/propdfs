import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';
import '../providers/auth_provider.dart';

/// 2FA / TOTP enrolment screen. Three steps:
///
/// 1. Backend generates a 160-bit TOTP secret (we display the QR +
///    raw secret). The user scans it with Google Authenticator /
///    1Password / Authy / Bitwarden.
/// 2. User types the 6-digit code their app shows to confirm enrolment.
/// 3. Backend enables 2FA and returns one-time backup codes. We
///    display them and let the user copy / screenshot.
///
/// Backend endpoint: `/api/v1/auth/2fa/setup` + `/api/v1/auth/2fa/enable`
class MfaSetupScreen extends ConsumerStatefulWidget {
  const MfaSetupScreen({super.key});

  @override
  ConsumerState<MfaSetupScreen> createState() => _MfaSetupScreenState();
}

class _MfaSetupScreenState extends ConsumerState<MfaSetupScreen> {
  int _step = 1; // 1 = QR, 2 = verify, 3 = backup codes
  String? _secret;
  String? _otpauthUrl;
  String? _qrDataUrl;
  bool _busy = false;
  String? _error;
  final _codeController = TextEditingController();
  List<String> _backupCodes = [];

  @override
  void initState() {
    super.initState();
    _startSetup();
  }

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _startSetup() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final dio = ref.read(apiClientProvider);
      final resp = await dio.post('/api/v1/auth/2fa/setup');
      if (!mounted) return;
      setState(() {
        _secret = resp.data['secret'] as String?;
        _otpauthUrl = resp.data['otpauth_url'] as String?;
        _qrDataUrl = resp.data['qr_png_data_url'] as String?;
        _busy = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not start setup: $e';
        _busy = false;
      });
    }
  }

  Future<void> _verifyAndEnable() async {
    final code = _codeController.text.trim();
    if (code.length != 6 || int.tryParse(code) == null) {
      setState(() => _error = 'Enter the 6-digit code from your app.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final dio = ref.read(apiClientProvider);
      final resp = await dio.post(
        '/api/v1/auth/2fa/enable',
        data: {'code': code},
      );
      if (!mounted) return;
      final codes = (resp.data['backup_codes'] as List?)?.cast<String>() ?? [];
      setState(() {
        _backupCodes = codes;
        _busy = false;
        _step = 3;
      });
      // Refresh the auth state so settings reflects is_mfa_enabled.
      ref.invalidate(authStateProvider);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'That code didn\'t match. Wait for the next one and '
            'try again. (Codes rotate every 30s.)';
        _busy = false;
      });
    }
  }

  Future<void> _copyBackupCodes() async {
    await Clipboard.setData(
      ClipboardData(text: _backupCodes.join('\n')),
    );
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Backup codes copied to clipboard.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surfaceLight,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/settings'),
        ),
        title: const Text('Set up two-factor authentication'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: _step == 1 ? _buildStepQr() :
                _step == 2 ? _buildStepVerify() :
                                _buildStepBackupCodes(),
          ),
        ),
      ),
    );
  }

  Widget _buildStepQr() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildStepHeader(
          n: 1,
          title: 'Scan this QR with your authenticator app',
          subtitle:
              'Open Google Authenticator, 1Password, Authy, or Bitwarden '
              'and scan the code below. The app will start showing a '
              '6-digit code that rotates every 30 seconds.',
        ),
        const SizedBox(height: 16),
        if (_busy)
          const Center(
            child: Padding(
              padding: EdgeInsets.all(32),
              child: CircularProgressIndicator(),
            ),
          )
        else if (_error != null)
          _buildError(_error!)
        else if (_qrDataUrl != null) ...[
          // Render the QR via Image.memory so the data URL works
          // without any package-specific PNG decoder.
          ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: Container(
              padding: const EdgeInsets.all(20),
              color: Colors.white,
              child: _QrFromOtpauth(otpauthUrl: _otpauthUrl ?? ''),
            ),
          ),
          const SizedBox(height: 16),
          // Manual secret entry for password managers that prefer
          // pasting the secret over scanning.
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.surfaceMutedLight,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.borderLight),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  "Can't scan? Paste this secret into your app:",
                  style: TextStyle(
                      fontSize: 12, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 4),
                SelectableText(
                  _secret ?? '',
                  style: const TextStyle(
                    fontFamily: 'monospace',
                    fontSize: 13,
                    letterSpacing: 1.5,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: () => setState(() => _step = 2),
            style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            child: const Text("I've scanned the code — next"),
          ),
        ],
      ],
    );
  }

  Widget _buildStepVerify() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildStepHeader(
          n: 2,
          title: 'Enter the 6-digit code from your app',
          subtitle:
              'Type the code your authenticator shows right now. We use it '
              'to confirm the QR scan worked before turning 2FA on.',
        ),
        const SizedBox(height: 24),
        TextField(
          controller: _codeController,
          autofocus: true,
          keyboardType: TextInputType.number,
          textAlign: TextAlign.center,
          maxLength: 6,
          style: const TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.w800,
            letterSpacing: 8,
          ),
          decoration: const InputDecoration(
            hintText: '000000',
            counterText: '',
            border: OutlineInputBorder(),
          ),
          onSubmitted: (_) => _verifyAndEnable(),
        ),
        if (_error != null) ...[
          const SizedBox(height: 12),
          _buildError(_error!),
        ],
        const SizedBox(height: 24),
        FilledButton.icon(
          onPressed: _busy ? null : _verifyAndEnable,
          icon: _busy
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: Colors.white),
                )
              : const Icon(Icons.check),
          label: Text(_busy ? 'Verifying…' : 'Enable two-factor'),
          style: FilledButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 14),
          ),
        ),
        const SizedBox(height: 8),
        TextButton(
          onPressed: _busy ? null : () => setState(() => _step = 1),
          child: const Text('Back to QR'),
        ),
      ],
    );
  }

  Widget _buildStepBackupCodes() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildStepHeader(
          n: 3,
          title: 'Save your backup codes',
          subtitle:
              'Each code works once if you lose your authenticator. '
              "Treat them like passwords — don't share, screenshot only "
              'into a password manager.',
        ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.surfaceMutedLight,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.borderLight),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final c in _backupCodes)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: SelectableText(
                    c,
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 16,
                      letterSpacing: 2,
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _copyBackupCodes,
                icon: const Icon(Icons.copy),
                label: const Text('Copy codes'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: FilledButton.icon(
                onPressed: () => context.go('/settings'),
                icon: const Icon(Icons.check),
                label: const Text("I've saved them"),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildStepHeader({
    required int n,
    required String title,
    required String subtitle,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: AppColors.primary,
            shape: BoxShape.circle,
          ),
          child: Center(
            child: Text(
              '$n',
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w800,
                fontSize: 16,
              ),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textLight,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                subtitle,
                style: const TextStyle(
                  fontSize: 14,
                  color: AppColors.textMutedLight,
                  height: 1.5,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildError(String msg) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.danger.withOpacity(0.08),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.danger.withOpacity(0.30)),
        ),
        child: Row(
          children: [
            const Icon(Icons.error_outline, color: AppColors.danger),
            const SizedBox(width: 12),
            Expanded(child: Text(msg)),
          ],
        ),
      );
}

/// Render an `otpauth://` URI as a QR using qr_flutter. The backend
/// returns the URI alongside the PNG data URL — we use the URI
/// directly so the QR matches the secret byte-for-byte (the PNG
/// round-trip is for browsers that can't render otpauth:// directly).
class _QrFromOtpauth extends StatelessWidget {
  final String otpauthUrl;
  const _QrFromOtpauth({required this.otpauthUrl});

  @override
  Widget build(BuildContext context) {
    if (otpauthUrl.isEmpty) {
      return Container(
        width: 260,
        height: 260,
        color: Colors.grey[100],
        alignment: Alignment.center,
        child: const Text(
          'QR not available.',
          style: TextStyle(fontSize: 13, color: Colors.grey),
        ),
      );
    }
    return QrImageView(
      data: otpauthUrl,
      version: QrVersions.auto,
      size: 260,
      backgroundColor: Colors.white,
      eyeStyle: const QrEyeStyle(
        eyeShape: QrEyeShape.square,
        color: Colors.black,
      ),
      dataModuleStyle: const QrDataModuleStyle(
        dataModuleShape: QrDataModuleShape.square,
        color: Colors.black,
      ),
    );
  }
}
