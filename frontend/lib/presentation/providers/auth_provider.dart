import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/api_client.dart';

class User {
  final String id;
  final String email;
  final String? fullName;
  final String planTier;
  final bool isEmailVerified;
  final DateTime createdAt;

  User({
    required this.id,
    required this.email,
    this.fullName,
    required this.planTier,
    required this.isEmailVerified,
    required this.createdAt,
  });

  factory User.fromJson(Map<String, dynamic> json) => User(
        id: json['id'],
        email: json['email'],
        fullName: json['full_name'],
        planTier: json['plan_tier'] ?? 'free',
        isEmailVerified: json['is_email_verified'] ?? false,
        createdAt: DateTime.parse(json['created_at']),
      );
}

class AuthState {
  final User? user;
  final String? accessToken;
  final String? refreshToken;
  final bool isLoading;
  final String? error;

  const AuthState({
    this.user,
    this.accessToken,
    this.refreshToken,
    this.isLoading = false,
    this.error,
  });

  AuthState copyWith({
    User? user,
    String? accessToken,
    String? refreshToken,
    bool? isLoading,
    String? error,
  }) {
    return AuthState(
      user: user ?? this.user,
      accessToken: accessToken ?? this.accessToken,
      refreshToken: refreshToken ?? this.refreshToken,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class AuthNotifier extends StateNotifier<AsyncValue<AuthState>> {
  final Dio _dio;
  static const _tokenKey = 'auth_tokens';

  AuthNotifier(this._dio) : super(const AsyncValue.loading()) {
    _loadStoredAuth();
  }

  Future<void> _loadStoredAuth() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final tokensJson = prefs.getString(_tokenKey);
      if (tokensJson != null) {
        final tokens = jsonDecode(tokensJson) as Map<String, dynamic>;
        final accessToken = tokens['access_token'] as String;
        _dio.options.headers['Authorization'] = 'Bearer $accessToken';
        final response = await _dio.get('/api/v1/auth/me');
        final user = User.fromJson(response.data);
        state = AsyncValue.data(AuthState(
          user: user,
          accessToken: accessToken,
          refreshToken: tokens['refresh_token'] as String,
        ));
      } else {
        state = const AsyncValue.data(AuthState());
      }
    } catch (e) {
      state = const AsyncValue.data(AuthState());
    }
  }

  /// Login. Returns `true` if the user must complete a 2FA step next,
  /// `false` if login completed normally.
  ///
  /// When MFA is enabled the server returns `{mfa_required: true, mfa_token: ...}`
  /// instead of a normal token pair. We persist that token temporarily
  /// so [verifyMfa] can POST it along with the 6-digit code.
  Future<bool> login(
    String email,
    String password, {
    String? turnstileToken,
  }) async {
    state = AsyncValue.data(state.value!.copyWith(isLoading: true, error: null));
    try {
      final response = await _dio.post('/api/v1/auth/login', data: {
        'email': email,
        'password': password,
        if (turnstileToken != null && turnstileToken.isNotEmpty)
          'turnstile_token': turnstileToken,
      });
      final body = response.data as Map<String, dynamic>;

      // Server tells us "you need to enter a TOTP code now".
      if (body['mfa_required'] == true && body['mfa_token'] != null) {
        _pendingMfaToken = body['mfa_token'] as String;
        state = AsyncValue.data(state.value!.copyWith(isLoading: false));
        return true;
      }

      // Normal login — got tokens immediately.
      await _saveTokens(body);
      _dio.options.headers['Authorization'] = 'Bearer ${body['access_token']}';

      final userResponse = await _dio.get('/api/v1/auth/me');
      final user = User.fromJson(userResponse.data);

      state = AsyncValue.data(AuthState(
        user: user,
        accessToken: body['access_token'] as String,
        refreshToken: body['refresh_token'] as String,
      ));
      return false;
    } on DioException catch (e) {
      final msg = e.response?.data?['detail'] ?? 'Login failed';
      state = AsyncValue.data(state.value!.copyWith(isLoading: false, error: msg));
      return false;
    }
  }

  /// Token held between the first login response and the 2FA verify
  /// call. Cleared after verify (success or failure).
  String? _pendingMfaToken;

  /// Complete a 2FA-protected login. Returns true on success.
  Future<bool> verifyMfa(String code) async {
    final token = _pendingMfaToken;
    if (token == null) {
      state = AsyncValue.data(
        state.value!.copyWith(error: 'No pending 2FA challenge. Sign in again.'),
      );
      return false;
    }
    state = AsyncValue.data(state.value!.copyWith(isLoading: true, error: null));
    try {
      final response = await _dio.post(
        '/api/v1/auth/2fa/verify',
        data: {'mfa_token': token, 'code': code},
      );
      final body = response.data as Map<String, dynamic>;
      await _saveTokens(body);
      _dio.options.headers['Authorization'] = 'Bearer ${body['access_token']}';

      final userResponse = await _dio.get('/api/v1/auth/me');
      final user = User.fromJson(userResponse.data);

      _pendingMfaToken = null;
      state = AsyncValue.data(AuthState(
        user: user,
        accessToken: body['access_token'] as String,
        refreshToken: body['refresh_token'] as String,
      ));
      return true;
    } on DioException catch (e) {
      final msg = e.response?.data?['detail'] ?? 'Invalid code';
      state = AsyncValue.data(state.value!.copyWith(isLoading: false, error: msg));
      return false;
    }
  }

  Future<void> register(
    String email,
    String password, {
    String? fullName,
    String? turnstileToken,
  }) async {
    state = AsyncValue.data(state.value!.copyWith(isLoading: true, error: null));
    try {
      final response = await _dio.post('/api/v1/auth/register', data: {
        'email': email,
        'password': password,
        'full_name': fullName,
        if (turnstileToken != null && turnstileToken.isNotEmpty)
          'turnstile_token': turnstileToken,
      });
      final tokens = response.data as Map<String, dynamic>;
      await _saveTokens(tokens);
      _dio.options.headers['Authorization'] = 'Bearer ${tokens['access_token']}';
      
      final userResponse = await _dio.get('/api/v1/auth/me');
      final user = User.fromJson(userResponse.data);
      
      state = AsyncValue.data(AuthState(
        user: user,
        accessToken: tokens['access_token'],
        refreshToken: tokens['refresh_token'],
      ));
    } on DioException catch (e) {
      final msg = e.response?.data?['detail'] ?? 'Registration failed';
      state = AsyncValue.data(state.value!.copyWith(isLoading: false, error: msg));
    }
  }

  Future<void> logout() async {
    try {
      await _dio.post('/api/v1/auth/logout');
    } catch (_) {}
    await _clearTokens();
    _dio.options.headers.remove('Authorization');
    state = const AsyncValue.data(AuthState());
  }

  /// Persist tokens (e.g. from OAuth callback URL) and rehydrate auth state.
  /// Used by the OAuth callback screen after Google/GitHub redirects back
  /// with `access_token` and `refresh_token` query params.
  Future<void> acceptTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    final tokens = {
      'access_token': accessToken,
      'refresh_token': refreshToken,
    };
    await _saveTokens(tokens);
    _dio.options.headers['Authorization'] = 'Bearer $accessToken';

    try {
      final userResponse = await _dio.get('/api/v1/auth/me');
      final user = User.fromJson(userResponse.data as Map<String, dynamic>);
      state = AsyncValue.data(AuthState(
        user: user,
        accessToken: accessToken,
        refreshToken: refreshToken,
      ));
    } on DioException catch (e) {
      // Backend unreachable or token rejected — surface as logged-out state
      // but keep the tokens so the user can retry by refreshing.
      state = AsyncValue.data(AuthState(
        accessToken: accessToken,
        refreshToken: refreshToken,
        error: e.response?.data?['detail'] ?? 'Failed to load profile',
      ));
    }
  }

  Future<void> _saveTokens(Map<String, dynamic> tokens) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, jsonEncode(tokens));
  }

  Future<void> _clearTokens() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
  }
}

final authStateProvider = StateNotifierProvider<AuthNotifier, AsyncValue<AuthState>>((ref) {
  final dio = ref.watch(apiClientProvider);
  return AuthNotifier(dio);
});
