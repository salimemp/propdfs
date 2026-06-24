import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';

/// Result of evaluating a password candidate against the policy.
///
/// Mirrors the backend's [PasswordCheckResult]. We duplicate the
/// rule IDs here so the UI never round-trips just to render a
/// checkmark — the local check is the source of truth for the
/// strength meter, the backend re-validates on submit so the
/// rules can't be bypassed by skipping the UI checks.
enum PasswordRule {
  minLength,
  uppercase,
  digit,
  special,
  notBreached,
}

extension PasswordRuleMeta on PasswordRule {
  String get id {
    switch (this) {
      case PasswordRule.minLength:
        return 'min_length';
      case PasswordRule.uppercase:
        return 'uppercase';
      case PasswordRule.digit:
        return 'digit';
      case PasswordRule.special:
        return 'special';
      case PasswordRule.notBreached:
        return 'not_breached';
    }
  }

  String get label {
    switch (this) {
      case PasswordRule.minLength:
        return 'At least 8 characters';
      case PasswordRule.uppercase:
        return 'At least 1 uppercase letter';
      case PasswordRule.digit:
        return 'At least 1 number';
      case PasswordRule.special:
        return 'At least 1 special character';
      case PasswordRule.notBreached:
        return 'Not found in known breaches';
    }
  }
}

/// Order rules render in. Structural rules first (so the user
/// sees the password getting stronger as they type), breach
/// check last (it's a network call, not a typing signal).
const List<PasswordRule> kPasswordRuleOrder = [
  PasswordRule.minLength,
  PasswordRule.uppercase,
  PasswordRule.digit,
  PasswordRule.special,
  PasswordRule.notBreached,
];

class PasswordEvaluation {
  /// Rules the password already passes. The strength meter
  /// shows these as ticked.
  final Set<PasswordRule> passed;

  /// Rules the password still fails. UI shows these as empty.
  final Set<PasswordRule> failed;

  /// HIBP breach count. Null = not checked yet (network call
  /// pending or the password was empty). 0 = checked, clean.
  /// >0 = checked, breached.
  final int? breachCount;

  /// True when the breach check has actually completed.
  final bool breachChecked;

  const PasswordEvaluation({
    required this.passed,
    required this.failed,
    this.breachCount,
    this.breachChecked = false,
  });

  /// Strength bucketed into 4 levels for the bar colour.
  PasswordStrength get strength {
    const structural = {
      PasswordRule.minLength,
      PasswordRule.uppercase,
      PasswordRule.digit,
      PasswordRule.special,
    };
    final structuralPassed =
        structural.every((r) => passed.contains(r));
    if (!structuralPassed) return PasswordStrength.weak;
    if (breachChecked && (breachCount ?? 0) > 0) {
      // Breached but meets structural rules = "fair, but flagged"
      return PasswordStrength.fair;
    }
    final allPassed = passed.containsAll(kPasswordRuleOrder);
    if (allPassed) return PasswordStrength.strong;
    return PasswordStrength.good;
  }

  bool get isAcceptable {
    const structural = {
      PasswordRule.minLength,
      PasswordRule.uppercase,
      PasswordRule.digit,
      PasswordRule.special,
    };
    if (!structural.every((r) => passed.contains(r))) return false;
    if (breachChecked && (breachCount ?? 0) > 0) return false;
    return true;
  }
}

enum PasswordStrength { weak, fair, good, strong }

extension PasswordStrengthMeta on PasswordStrength {
  Color get color {
    switch (this) {
      case PasswordStrength.weak:
        return const Color(0xFFEF4444);
      case PasswordStrength.fair:
        return const Color(0xFFF59E0B);
      case PasswordStrength.good:
        return const Color(0xFF10B981);
      case PasswordStrength.strong:
        return const Color(0xFF22C55E);
    }
  }

  String get label {
    switch (this) {
      case PasswordStrength.weak:
        return 'Weak';
      case PasswordStrength.fair:
        return 'Fair';
      case PasswordStrength.good:
        return 'Good';
      case PasswordStrength.strong:
        return 'Strong';
    }
  }

  /// 0..1 — how full the bar is.
  double get fill {
    switch (this) {
      case PasswordStrength.weak:
        return 0.25;
      case PasswordStrength.fair:
        return 0.5;
      case PasswordStrength.good:
        return 0.75;
      case PasswordStrength.strong:
        return 1.0;
    }
  }
}

/// Visual state of one rule row in the strength meter.
enum _RuleState { passed, failed, pending }

/// Compute the [_RuleState] for a given rule. Pulled out as a
/// top-level function so the meter widget can call it without
/// an extension-on-enum dance (extensions can't have static
/// members in Dart).
_RuleState _ruleStateFor(
  PasswordEvaluation evaluation,
  PasswordRule rule,
) {
  if (rule == PasswordRule.notBreached) {
    if (!evaluation.breachChecked) return _RuleState.pending;
    if ((evaluation.breachCount ?? 0) > 0) return _RuleState.failed;
    return _RuleState.passed;
  }
  if (evaluation.passed.contains(rule)) return _RuleState.passed;
  if (evaluation.failed.contains(rule)) return _RuleState.failed;
  return _RuleState.pending;
}

/// Pure-function rule check. No network — call [PasswordStrengthChecker]
/// for the breach lookup. Matches the backend's [check_password_rules]
/// in app/core/password_policy.py exactly.
PasswordEvaluation evaluatePassword(
  String password, {
  int? knownBreachCount,
  bool breachChecked = false,
}) {
  final passed = <PasswordRule>{};
  final failed = <PasswordRule>{};

  if (password.length >= 8) {
    passed.add(PasswordRule.minLength);
  } else {
    failed.add(PasswordRule.minLength);
  }

  if (RegExp(r'[A-Z]').hasMatch(password)) {
    passed.add(PasswordRule.uppercase);
  } else {
    failed.add(PasswordRule.uppercase);
  }

  if (RegExp(r'[0-9]').hasMatch(password)) {
    passed.add(PasswordRule.digit);
  } else {
    failed.add(PasswordRule.digit);
  }

  // Special characters — the same set the backend accepts. We
  // intentionally exclude whitespace so "abc 123" doesn't pass
  // by virtue of the space.
  if (RegExp(r'''[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?`~]''')
      .hasMatch(password)) {
    passed.add(PasswordRule.special);
  } else {
    failed.add(PasswordRule.special);
  }

  if (breachChecked && (knownBreachCount ?? 0) == 0) {
    passed.add(PasswordRule.notBreached);
  } else if (breachChecked && (knownBreachCount ?? 0) > 0) {
    failed.add(PasswordRule.notBreached);
  } else {
    // Not checked yet — don't put the rule in either set. The
    // meter shows it as "pending" until the lookup completes.
  }

  return PasswordEvaluation(
    passed: passed,
    failed: failed,
    breachCount: knownBreachCount,
    breachChecked: breachChecked,
  );
}

/// Network-backed wrapper that runs [evaluatePassword] plus an
/// HIBP breach check (debounced). Drop into a [ConsumerStatefulWidget]
/// and pass the password controller + a `onChanged` callback.
///
/// We do NOT await the breach check — the meter shows ticks for
/// structural rules instantly, and the breach indicator animates
/// in once the network call returns.
class PasswordStrengthChecker extends ConsumerStatefulWidget {
  final TextEditingController passwordController;
  final ValueChanged<PasswordEvaluation> onChanged;

  /// Debounce between keystrokes and the HIBP network call, in
  /// milliseconds. 400ms is enough to skip the call on rapid
  /// typing without making the breach check feel slow once the
  /// user pauses.
  final int debounceMs;

  const PasswordStrengthChecker({
    super.key,
    required this.passwordController,
    required this.onChanged,
    this.debounceMs = 400,
  });

  @override
  ConsumerState<PasswordStrengthChecker> createState() =>
      _PasswordStrengthCheckerState();
}

class _PasswordStrengthCheckerState
    extends ConsumerState<PasswordStrengthChecker> {
  Timer? _debounce;
  int? _breachCount;
  bool _breachChecked = false;
  bool _checking = false;
  String _lastCheckedPassword = '';

  @override
  void initState() {
    super.initState();
    widget.passwordController.addListener(_onPasswordChanged);
    _emit();
  }

  @override
  void dispose() {
    widget.passwordController.removeListener(_onPasswordChanged);
    _debounce?.cancel();
    super.dispose();
  }

  void _onPasswordChanged() {
    _emit();
    _debounce?.cancel();
    final pw = widget.passwordController.text;
    if (pw.length < 4) {
      // Too short to be a useful HIBP check — short inputs
      // almost always return 0 anyway. Skip the network call.
      setState(() {
        _breachCount = null;
        _breachChecked = false;
        _checking = false;
      });
      return;
    }
    _debounce = Timer(
      Duration(milliseconds: widget.debounceMs),
      () => _checkBreach(pw),
    );
  }

  Future<void> _checkBreach(String password) async {
    if (_lastCheckedPassword == password && _breachChecked) return;
    setState(() {
      _checking = true;
    });
    try {
      final dio = ref.read(apiClientProvider);
      final resp = await dio.post(
        '/api/v1/auth/password-breach-check',
        data: {'password': password},
      );
      if (!mounted) return;
      // If the user kept typing past our debounce, the response
      // we got back is stale — drop it. The next debounce tick
      // will catch up.
      if (widget.passwordController.text != password) return;
      setState(() {
        _breachCount = (resp.data['breach_count'] as int?) ?? 0;
        _breachChecked = resp.data['checked'] as bool? ?? false;
        _checking = false;
        _lastCheckedPassword = password;
      });
      _emit();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _checking = false;
        // On network failure we treat the breach check as
        // "unknown" — leave _breachChecked false so the meter
        // shows the rule as pending.
      });
      _emit();
    }
  }

  void _emit() {
    final pw = widget.passwordController.text;
    final evaluation = evaluatePassword(
      pw,
      knownBreachCount: _breachCount,
      breachChecked: _breachChecked,
    );
    widget.onChanged(evaluation);
  }

  @override
  Widget build(BuildContext context) {
    final pw = widget.passwordController.text;
    final evaluation = evaluatePassword(
      pw,
      knownBreachCount: _breachCount,
      breachChecked: _breachChecked,
    );
    return PasswordStrengthMeter(
      evaluation: evaluation,
      checkingBreach: _checking,
    );
  }
}

/// Visual strength meter — coloured bar + label + per-rule list.
/// Stateless; the parent ([PasswordStrengthChecker]) is what
/// fires the network calls and re-renders.
class PasswordStrengthMeter extends StatelessWidget {
  final PasswordEvaluation evaluation;
  final bool checkingBreach;

  const PasswordStrengthMeter({
    super.key,
    required this.evaluation,
    this.checkingBreach = false,
  });

  @override
  Widget build(BuildContext context) {
    if (evaluation.passed.isEmpty &&
        evaluation.failed.isEmpty &&
        !evaluation.breachChecked) {
      // Empty password — render nothing rather than an
      // empty-bar-with-no-meaning.
      return const SizedBox.shrink();
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Bar
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: evaluation.strength.fill,
            minHeight: 6,
            backgroundColor: const Color(0xFF1a1a2e),
            valueColor: AlwaysStoppedAnimation(evaluation.strength.color),
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Text(
              'Password strength: ',
              style: TextStyle(
                fontSize: 12,
                color: Colors.grey[400],
              ),
            ),
            Text(
              evaluation.strength.label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: evaluation.strength.color,
              ),
            ),
            const Spacer(),
            if (checkingBreach)
              SizedBox(
                width: 12,
                height: 12,
                child: CircularProgressIndicator(
                  strokeWidth: 1.5,
                  color: Colors.grey[500],
                ),
              ),
          ],
        ),
        const SizedBox(height: 12),
        // Per-rule checklist
        ...kPasswordRuleOrder.map(
          (rule) => _RuleRow(
            rule: rule,
            state: _ruleStateFor(evaluation, rule),
            breachCount: evaluation.breachCount,
            breachChecked: evaluation.breachChecked,
          ),
        ),
      ],
    );
  }
}

class _RuleRow extends StatelessWidget {
  final PasswordRule rule;
  final _RuleState state;
  final int? breachCount;
  final bool breachChecked;

  const _RuleRow({
    required this.rule,
    required this.state,
    required this.breachCount,
    required this.breachChecked,
  });

  @override
  Widget build(BuildContext context) {
    final (icon, color, label) = switch (state) {
      _RuleState.passed => (
          Icons.check_circle,
          const Color(0xFF22C55E),
          rule.label,
        ),
      _RuleState.failed => (
          Icons.cancel,
          const Color(0xFFEF4444),
          _failureCopy(),
        ),
      _RuleState.pending => (
          Icons.radio_button_unchecked,
          const Color(0xFF6B7280),
          '${rule.label} (checking…)',
        ),
    };
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 12,
                color: color,
                height: 1.3,
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _failureCopy() {
    if (rule == PasswordRule.notBreached &&
        breachChecked &&
        (breachCount ?? 0) > 0) {
      // Format large numbers compactly. "Found in 2.1M known
      // breaches" reads better than the raw integer.
      final n = breachCount!;
      final compact = n >= 1000000
          ? '${(n / 1000000).toStringAsFixed(1)}M'
          : n >= 1000
              ? '${(n / 1000).toStringAsFixed(1)}k'
              : '$n';
      return 'Found in $compact known data breaches — pick another';
    }
    return 'Missing — ${rule.label.toLowerCase()}';
  }
}

/// Convenience copy-button helper — `PasswordFieldController.copyToClipboard`.
/// Kept here so the password field + strength meter share the
/// same clipboard path.
void copyToClipboard(BuildContext context, String value) {
  Clipboard.setData(ClipboardData(text: value));
  ScaffoldMessenger.of(context).showSnackBar(
    const SnackBar(
      content: Text('Copied to clipboard'),
      duration: Duration(seconds: 1),
    ),
  );
}