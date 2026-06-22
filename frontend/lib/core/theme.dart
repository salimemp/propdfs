import 'package:flutter/material.dart';

/// ProPDFs design tokens.
///
/// Color scheme is intentionally different from iLovePDF's red:
/// - Primary: Indigo (`#4F46E5`) — distinctive, modern SaaS feel
/// - Accent: Cyan (`#06B6D4`) — fresh, tech-forward
/// - Surface: clean whites / deep slate
///
/// All tokens are exposed as static constants so widgets can reference
/// them directly without rebuilding the theme.
class AppColors {
  AppColors._();

  // Brand
  static const Color primary = Color(0xFF4F46E5); // indigo-600
  static const Color primaryDark = Color(0xFF3730A3); // indigo-800
  static const Color primaryLight = Color(0xFF818CF8); // indigo-400
  static const Color accent = Color(0xFF06B6D4); // cyan-500
  static const Color accentDark = Color(0xFF0891B2); // cyan-600

  // Surfaces
  static const Color surfaceLight = Color(0xFFFFFFFF);
  static const Color surfaceMutedLight = Color(0xFFF8FAFC); // slate-50
  static const Color surfaceDark = Color(0xFF0F172A); // slate-900
  static const Color surfaceMutedDark = Color(0xFF1E293B); // slate-800

  // Borders
  static const Color borderLight = Color(0xFFE2E8F0); // slate-200
  static const Color borderDark = Color(0xFF334155); // slate-700

  // Text
  static const Color textLight = Color(0xFF0F172A); // slate-900
  static const Color textMutedLight = Color(0xFF64748B); // slate-500
  static const Color textDark = Color(0xFFF1F5F9); // slate-100
  static const Color textMutedDark = Color(0xFF94A3B8); // slate-400

  // Status
  static const Color success = Color(0xFF10B981); // emerald-500
  static const Color warning = Color(0xFFF59E0B); // amber-500
  static const Color danger = Color(0xFFEF4444); // red-500

  // Tool category colors (used to color-code cards in the grid)
  static const Color catOrganize = Color(0xFF4F46E5); // indigo
  static const Color catOptimize = Color(0xFF06B6D4); // cyan
  static const Color catConvertTo = Color(0xFF8B5CF6); // violet
  static const Color catConvertFrom = Color(0xFFEC4899); // pink
  static const Color catEdit = Color(0xFFF59E0B); // amber
  static const Color catSecurity = Color(0xFF10B981); // emerald
  static const Color catAi = Color(0xFFEF4444); // red
}

class AppSpacing {
  AppSpacing._();
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 16;
  static const double lg = 24;
  static const double xl = 32;
  static const double xxl = 48;
  static const double xxxl = 64;
}

class AppRadius {
  AppRadius._();
  static const double sm = 6;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
  static const double full = 999;
}

class AppTheme {
  static ThemeData light() {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      scaffoldBackgroundColor: AppColors.surfaceLight,
      colorScheme: const ColorScheme.light(
        primary: AppColors.primary,
        onPrimary: Colors.white,
        secondary: AppColors.accent,
        onSecondary: Colors.white,
        surface: AppColors.surfaceLight,
        onSurface: AppColors.textLight,
        error: AppColors.danger,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.surfaceLight,
        foregroundColor: AppColors.textLight,
        elevation: 0,
        centerTitle: false,
      ),
      textTheme: _textTheme(AppColors.textLight),
    );
  }

  static ThemeData dark() {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: AppColors.surfaceDark,
      colorScheme: const ColorScheme.dark(
        primary: AppColors.primaryLight,
        onPrimary: Colors.white,
        secondary: AppColors.accent,
        onSecondary: Colors.white,
        surface: AppColors.surfaceDark,
        onSurface: AppColors.textDark,
        error: AppColors.danger,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.surfaceDark,
        foregroundColor: AppColors.textDark,
        elevation: 0,
        centerTitle: false,
      ),
      textTheme: _textTheme(AppColors.textDark),
    );
  }

  static TextTheme _textTheme(Color textColor) {
    return TextTheme(
      displayLarge: TextStyle(
        fontSize: 56,
        fontWeight: FontWeight.w800,
        color: textColor,
        letterSpacing: -1.5,
        height: 1.1,
      ),
      displayMedium: TextStyle(
        fontSize: 44,
        fontWeight: FontWeight.w800,
        color: textColor,
        letterSpacing: -1,
        height: 1.1,
      ),
      displaySmall: TextStyle(
        fontSize: 36,
        fontWeight: FontWeight.w700,
        color: textColor,
        letterSpacing: -0.5,
        height: 1.15,
      ),
      headlineLarge: TextStyle(
        fontSize: 30,
        fontWeight: FontWeight.w700,
        color: textColor,
        letterSpacing: -0.5,
      ),
      headlineMedium: TextStyle(
        fontSize: 24,
        fontWeight: FontWeight.w700,
        color: textColor,
      ),
      headlineSmall: TextStyle(
        fontSize: 20,
        fontWeight: FontWeight.w600,
        color: textColor,
      ),
      titleLarge: TextStyle(
        fontSize: 18,
        fontWeight: FontWeight.w600,
        color: textColor,
      ),
      titleMedium: TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.w600,
        color: textColor,
      ),
      titleSmall: TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        color: textColor,
      ),
      bodyLarge: TextStyle(fontSize: 16, color: textColor, height: 1.5),
      bodyMedium: TextStyle(fontSize: 14, color: textColor, height: 1.5),
      bodySmall: TextStyle(fontSize: 13, color: textColor, height: 1.4),
      labelLarge: TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        color: textColor,
      ),
    );
  }
}
