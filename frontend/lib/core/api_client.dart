import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sentry_dio/sentry_dio.dart';
import 'package:shared_preferences/shared_preferences.dart';

const String _baseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://localhost:8000',
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
