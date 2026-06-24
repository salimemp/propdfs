import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme.dart';
import '../../widgets/backend_tool_scaffold.dart';

/// Add a password to a PDF. AES-256 encryption via pikepdf; both
/// the user (open) password and the owner (edit-restriction)
/// password are accepted. By default the owner password matches
/// the user password — pass a separate one if you want to lock
/// out permission changes.
class ProtectPdfPage extends ConsumerStatefulWidget {
  const ProtectPdfPage({super.key});

  @override
  ConsumerState<ProtectPdfPage> createState() => _ProtectPdfPageState();
}

class _ProtectPdfPageState extends ConsumerState<ProtectPdfPage> {
  final _userPw = TextEditingController();
  final _confirmPw = TextEditingController();
  bool _separateOwner = false;
  final _ownerPw = TextEditingController();
  bool _showUserPw = false;

  @override
  void dispose() {
    _userPw.dispose();
    _confirmPw.dispose();
    _ownerPw.dispose();
    super.dispose();
  }

  String? _userPwError() {
    final pw = _userPw.text;
    if (pw.isEmpty) return 'Enter a password';
    if (pw.length < 4) return 'Use at least 4 characters';
    if (pw != _confirmPw.text) return 'Passwords don\'t match';
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final userErr = _userPwError();
    final formIsValid = userErr == null &&
        (!_separateOwner || _ownerPw.text.length >= 4);
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
                Icons.lock,
                size: 18,
                color: AppColors.catSecurity,
              ),
            ),
            const SizedBox(width: 10),
            const Text('Protect PDF'),
          ],
        ),
      ),
      body: ToolFormScope(
        isValid: formIsValid,
        child: BackendToolScaffold(
          accent: AppColors.catSecurity,
          taskType: 'protect',
          pickLabel: 'Choose a PDF to protect',
          ctaLabel: 'Protect PDF',
          busyLabel: 'Encrypting...',
          ctaHint:
              'We use AES-256 (the strongest PDF encryption every modern '
              'viewer supports). Your password never leaves the server in '
              'plaintext — it\'s sent over HTTPS and used only to derive '
              'the encryption key.',
          buildParams: () {
            if (userErr != null) throw Exception(userErr);
            return {
              'user_password': _userPw.text,
              if (_separateOwner) 'owner_password': _ownerPw.text,
            };
          },
          form: _buildForm(userErr),
        ),
      ),
    );
  }

  Widget _buildForm(String? userErr) {
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
            'Set a password',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: AppColors.textLight,
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _userPw,
            obscureText: !_showUserPw,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              labelText: 'Password',
              helperText: 'Required to open the file',
              errorText: userErr == 'Enter a password' ||
                      userErr == 'Use at least 4 characters'
                  ? userErr
                  : null,
              border: const OutlineInputBorder(),
              filled: true,
              fillColor: Colors.white,
              suffixIcon: IconButton(
                icon: Icon(
                  _showUserPw ? Icons.visibility_off : Icons.visibility,
                ),
                onPressed: () =>
                    setState(() => _showUserPw = !_showUserPw),
              ),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _confirmPw,
            obscureText: !_showUserPw,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              labelText: 'Confirm password',
              errorText:
                  userErr == 'Passwords don\'t match' ? userErr : null,
              border: const OutlineInputBorder(),
              filled: true,
              fillColor: Colors.white,
            ),
          ),
          const SizedBox(height: 16),
          CheckboxListTile(
            value: _separateOwner,
            onChanged: (v) => setState(() => _separateOwner = v ?? false),
            title: const Text(
              'Use a separate owner password',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
            ),
            subtitle: const Text(
              'Owner password is required to change permissions. Leave off '
              'if you just want a single password to open the file.',
              style: TextStyle(fontSize: 12, color: AppColors.textMutedLight),
            ),
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
          ),
          if (_separateOwner) ...[
            const SizedBox(height: 8),
            TextField(
              controller: _ownerPw,
              obscureText: true,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                labelText: 'Owner password',
                helperText: 'Required to change permissions later',
                border: const OutlineInputBorder(),
                filled: true,
                fillColor: Colors.white,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
