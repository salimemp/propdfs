/// Cloudflare Turnstile widget for Flutter web.
///
/// Drops a Turnstile iframe into the page via JS interop and
/// forwards the resulting token back to Dart. On native (iOS /
/// Android / macOS / Windows / Linux) the widget renders as a
/// no-op — the backend treats missing tokens as "Turnstile
/// disabled" when TURNSTILE_ENABLED=false, which is what we
/// want in mobile dev.
///
/// Why JS interop rather than a Flutter package: the official
/// Turnstile widget is a script tag that injects an iframe. There
/// is no Flutter SDK that wraps it; the canonical pattern is to
/// mount a `HtmlElementView` and call `turnstile.render()` from
/// Dart. We use `dart:js_interop` for the binding — stable across
/// Flutter versions and avoids the dart:html deprecation path.
library;

import 'dart:async';
import 'dart:js_interop';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/widgets.dart';

/// Bridges between Dart callbacks and the global `onTurnstileToken`
/// function that the Turnstile render() call invokes. The widget
/// script calls `window.onTurnstileToken(token)` when the user
/// completes (or fails) the challenge; this listener forwards
/// the value to the Dart side.
@JS('onTurnstileToken')
external set _onTurnstileToken(JSFunction fn);

@JS('renderTurnstile')
external JSPromise<JSAny?> _renderTurnstile(
  JSAny container,
  JSString siteKey,
);

@JS('resetTurnstile')
external JSPromise<JSAny?> _resetTurnstile();

/// The widget itself. Renders nothing on native (mobile); on web
/// it inserts a Turnstile iframe into the page and emits the
/// resulting token via [onToken].
class TurnstileWidget extends StatefulWidget {
  /// The Turnstile site key from Cloudflare. Public.
  final String siteKey;

  /// Whether the widget should actually render. When false (dev,
  /// local builds with no key configured), the widget becomes a
  /// pass-through that immediately fires [onToken] with an empty
  /// string. The backend treats empty tokens as "no Turnstile
  /// required" when TURNSTILE_ENABLED is false.
  final bool enabled;

  /// Callback fired with the token. Called once per challenge
  /// completion. May fire multiple times if the widget is reset
  /// (e.g. after a server-side rejection — the parent can call
  /// the global `resetTurnstile()` JS function).
  final ValueChanged<String> onToken;

  /// Widget to show while [enabled] is false. Defaults to an
  /// empty SizedBox; auth pages render their own "bot check
  /// disabled in dev" notice elsewhere.
  final Widget placeholder;

  const TurnstileWidget({
    super.key,
    required this.siteKey,
    required this.enabled,
    required this.onToken,
    this.placeholder = const SizedBox.shrink(),
  });

  @override
  State<TurnstileWidget> createState() => _TurnstileWidgetState();
}

class _TurnstileWidgetState extends State<TurnstileWidget> {
  late final String _containerId =
      'turnstile-${DateTime.now().microsecondsSinceEpoch}';

  /// Bridges the global JS callback back to Dart. We assign this
  /// to `window.onTurnstileToken` whenever the widget is mounted
  /// and the Turnstile widget calls it with the new token.
  void _jsCallback(String? token) {
    widget.onToken(token ?? '');
  }

  @override
  void initState() {
    super.initState();
    if (!widget.enabled) {
      // Dev mode / disabled — fire an empty token immediately so
      // the parent can submit the form without waiting on a
      // network challenge.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        widget.onToken('');
      });
      return;
    }

    // Web only. kIsWeb is true for Flutter web; false for
    // mobile/desktop.
    if (!kIsWeb) return;

    // Wire the JS callback to forward tokens to Dart.
    _onTurnstileToken = _jsCallback.toJS;

    // Mount the Turnstile iframe in the next frame so the
    // container DivElement is in the DOM when render() is called.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _mountTurnstile();
    });
  }

  @override
  void dispose() {
    if (kIsWeb && widget.enabled) {
      // The Turnstile script cleans up its own iframe on
      // container removal. We don't need to do anything explicit.
    }
    super.dispose();
  }

  Future<void> _mountTurnstile() async {
    try {
      await _renderTurnstile(_containerId.toJS, widget.siteKey.toJS)
          .toDart;
    } catch (e) {
      // If render fails (e.g. script not loaded yet, or the site
      // key is wrong) we emit an empty token so the form can
      // still submit. The backend will reject if Turnstile is
      // actually enabled.
      debugPrint('Turnstile render failed: $e');
      widget.onToken('');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.enabled || !kIsWeb) {
      return widget.placeholder;
    }

    // The actual iframe lives in a hidden HTML container managed
    // via JS interop. We render an empty SizedBox on the Dart side
    // because the iframe is added to the DOM directly by the
    // Turnstile script (not as a Flutter widget child).
    return _TurnstileContainer(
      containerId: _containerId,
      enabled: widget.enabled,
    );
  }

  /// Public hook the parent can call to reset the Turnstile widget
  /// after a rejection (e.g. wrong password → "try again" → new
  /// challenge). Exposed as a static so callers don't need a
  /// widget reference. The JS-side `resetTurnstile()` does the
  /// actual work; this just forwards the call. Currently unused
  /// by Dart but kept so callers can wire it later without
  /// touching the JS bridge again.
  // ignore: unused_element
  static Future<void> reset() async {
    if (!kIsWeb) return;
    try {
      await _resetTurnstile().toDart;
    } catch (_) {
      // Best-effort.
    }
  }
}

/// Empty widget on the Dart side. The actual iframe is mounted by
/// the Turnstile script via `window.renderTurnstile(containerId)`
/// in [_TurnstileWidgetState.initState]. SizedBox so the parent
/// layout doesn't have to fight with a real iframe element.
class _TurnstileContainer extends StatelessWidget {
  final String containerId;
  final bool enabled;

  const _TurnstileContainer({
    required this.containerId,
    required this.enabled,
  });

  @override
  Widget build(BuildContext context) {
    if (!enabled) return const SizedBox.shrink();
    // 65px is the default Turnstile widget height. Keeping the
    // SizedBox here means the auth form layout doesn't shift
    // when the widget loads.
    return const SizedBox(
      height: 65,
      child: Align(
        alignment: Alignment.centerLeft,
        // The iframe is inserted into a sibling DOM container
        // by the JS interop. From Dart's perspective this is
        // intentionally empty.
        child: SizedBox.shrink(),
      ),
    );
  }
}