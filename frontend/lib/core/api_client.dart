import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sentry_dio/sentry_dio.dart';
import 'package:shared_preferences/shared_preferences.dart';

const String _baseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://localhost:8000',
);

/// Cloudflare Turnstile site key. Public by design — Cloudflare publishes
/// it client-side on the widget. Only the matching SECRET_KEY (kept on
/// the backend) can verify the resulting tokens.
///
/// When empty (e.g. local dev, mobile builds) the widget renders as a
/// pass-through and the backend's TURNSTILE_ENABLED flag is the source
/// of truth — both must agree before any challenge runs.
const String _turnstileSiteKey = String.fromEnvironment(
  'TURNSTILE_SITE_KEY',
  defaultValue: '',
);

const String _tokenPrefsKey = 'auth_tokens';

class ApiBaseUrl {
  /// Public accessor — the Login screen and OAuth callback use this to build
  /// provider URLs (Google / GitHub OAuth start) instead of hardcoding
  /// `backend-production-*.up.railway.app`.
  static String get value => _baseUrl;

  /// Convenience: OAuth start URLs.
  static String oauthStart(String provider) =>
      '$_baseUrl/api/v1/auth/$provider/login';
}

/// Cloudflare Turnstile config. The widget is mounted on `/login` and
/// `/register`; if the site key is empty (default for local dev), the
/// widget short-circuits and the form submits without a token — the
/// backend treats missing tokens as "no Turnstile required" when
/// TURNSTILE_ENABLED is also false.
class TurnstileConfig {
  /// Public site key shipped in the bundle. Empty in dev / mobile.
  static String get siteKey => _turnstileSiteKey;

  /// Whether the widget should actually render. True only on web builds
  /// where the site key is configured. Mobile never renders the widget
  /// because Turnstile's iframe is a browser-only concept.
  static bool get enabled =>
      _turnstileSiteKey.isNotEmpty &&
      const bool.fromEnvironment('dart.library.html'); // web-only
}

final apiClientProvider = Provider<Dio>((ref) {
  final dio = Dio(BaseOptions(
    baseUrl: _baseUrl,
    connectTimeout: const Duration(seconds: 30),
    receiveTimeout: const Duration(seconds: 60),
    sendTimeout: const Duration(seconds: 120),
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  ));

  dio.interceptors.add(LogInterceptor(
    requestBody: true,
    responseBody: true,
  ));

  // Sentry interceptor — adds request/response breadcrumbs and captures
  // 5xx + network errors as events. addSentry() is a no-op when Sentry
  // isn't initialised (i.e. dev builds without SENTRY_DSN).
  dio.addSentry();

  dio.interceptors.add(InterceptorsWrapper(
    onError: (DioException e, handler) async {
      if (e.response?.statusCode == 401) {
        // Attempt one token refresh before failing.
        final prefs = await SharedPreferences.getInstance();
        final tokensJson = prefs.getString(_tokenPrefsKey);
        if (tokensJson != null) {
          try {
            final tokens = jsonDecode(tokensJson) as Map<String, dynamic>;
            final refreshToken = tokens['refresh_token'] as String?;
            if (refreshToken != null) {
              final resp = await Dio(BaseOptions(baseUrl: _baseUrl)).post(
                '/api/v1/auth/refresh',
                data: {'refresh_token': refreshToken},
              );
              final fresh = resp.data as Map<String, dynamic>;
              await prefs.setString(_tokenPrefsKey, jsonEncode(fresh));
              final newAccess = fresh['access_token'] as String;
              e.requestOptions.headers['Authorization'] = 'Bearer $newAccess';
              // Retry the original request once.
              final retry = await dio.fetch(e.requestOptions);
              return handler.resolve(retry);
            }
          } catch (_) {
            // Refresh failed — fall through to the original 401.
          }
        }
      }
      return handler.next(e);
    },
  ));

  return dio;
});
