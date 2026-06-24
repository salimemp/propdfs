import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme.dart';
import '../../widgets/backend_tool_scaffold.dart';

/// Remove a password from a PDF. The user must already know the
/// password (we just need it to decrypt; we don't crack anything).
/// Output is a plain, unencrypted PDF.
class UnlockPdfPage extends ConsumerStatefulWidget {
  const UnlockPdfPage({super.key});

  @override
  ConsumerState<UnlockPdfPage> createState() => _UnlockPdfPageState();
}

class _UnlockPdfPageState extends ConsumerState<UnlockPdfPage> {
  final _password = TextEditingController();
  bool _showPw = false;

  @override
  void dispose() {
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pw = _password.text;
    final formIsValid = pw.isNotEmpty;
    return Scaffold(
      backgroundColor: AppColors.surfaceLight,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/tools'),
        ),
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: AppColors.catSecurity.withOpacity(0.12),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(
                Icons.lock_open,
                size: 18,
                color: AppColors.catSecurity,
              ),
            ),
            const SizedBox(width: 10),
            const Text('Unlock PDF'),
          ],
        ),
      ),
      body: ToolFormScope(
        isValid: formIsValid,
        child: BackendToolScaffold(
          accent: AppColors.catSecurity,
          taskType: 'unlock',
          pickLabel: 'Choose a password-protected PDF',
          ctaLabel: 'Unlock PDF',
          busyLabel: 'Decrypting...',
          ctaHint:
              'You must already know the password — we don\'t crack or '
              'bypass it. The decrypted file is generated server-side and '
              'streamed straight to your browser.',
          buildParams: () {
            if (!formIsValid) throw Exception('Enter the password');
            return {'password': pw};
          },
          form: _buildForm(),
        ),
      ),
    );
  }

  Widget _buildForm() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surfaceMutedLight,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderLight),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Enter the password',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: AppColors.textLight,
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _password,
            obscureText: !_showPw,
            autofocus: true,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              labelText: 'Password',
              helperText: 'The password required to open the file',
              border: const OutlineInputBorder(),
              filled: true,
              fillColor: Colors.white,
              suffixIcon: IconButton(
                icon: Icon(_showPw ? Icons.visibility_off : Icons.visibility),
                onPressed: () => setState(() => _showPw = !_showPw),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
