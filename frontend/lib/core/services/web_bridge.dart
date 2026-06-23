// Conditional re-export of either the stub (non-web) or real
// (web) implementation. Tool pages import this file directly so
// they get the right symbol set on each platform.
//
// Why conditional: dart:js_interop is web-only. The Dart VM used by
// `flutter test` doesn't have it, so a single-file implementation
// breaks the test build.

export 'web_bridge_stub.dart'
    if (dart.library.js_interop) 'web_bridge_web.dart';
