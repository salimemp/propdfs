import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AccessibilitySettings {
  final double textScale;
  final bool highContrast;
  final bool reduceAnimations;
  final bool screenReaderOptimized;
  final bool enableVoiceCommands;
  final bool enableReadAloud;
  final String colorScheme;

  AccessibilitySettings({
    this.textScale = 1.0,
    this.highContrast = false,
    this.reduceAnimations = false,
    this.screenReaderOptimized = false,
    this.enableVoiceCommands = false,
    this.enableReadAloud = false,
    this.colorScheme = 'standard',
  });

  AccessibilitySettings copyWith({
    double? textScale,
    bool? highContrast,
    bool? reduceAnimations,
    bool? screenReaderOptimized,
    bool? enableVoiceCommands,
    bool? enableReadAloud,
    String? colorScheme,
  }) {
    return AccessibilitySettings(
      textScale: textScale ?? this.textScale,
      highContrast: highContrast ?? this.highContrast,
      reduceAnimations: reduceAnimations ?? this.reduceAnimations,
      screenReaderOptimized: screenReaderOptimized ?? this.screenReaderOptimized,
      enableVoiceCommands: enableVoiceCommands ?? this.enableVoiceCommands,
      enableReadAloud: enableReadAloud ?? this.enableReadAloud,
      colorScheme: colorScheme ?? this.colorScheme,
    );
  }
}

class AccessibilityNotifier extends StateNotifier<AccessibilitySettings> {
  AccessibilityNotifier() : super(AccessibilitySettings()) {
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    final prefs = await SharedPreferences.getInstance();
    state = AccessibilitySettings(
      textScale: prefs.getDouble('text_scale') ?? 1.0,
      highContrast: prefs.getBool('high_contrast') ?? false,
      reduceAnimations: prefs.getBool('reduce_animations') ?? false,
      screenReaderOptimized: prefs.getBool('screen_reader') ?? false,
      enableVoiceCommands: prefs.getBool('voice_commands') ?? false,
      enableReadAloud: prefs.getBool('read_aloud') ?? false,
      colorScheme: prefs.getString('color_scheme') ?? 'standard',
    );
  }

  Future<void> setTextScale(double scale) async {
    state = state.copyWith(textScale: scale);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setDouble('text_scale', scale);
  }

  Future<void> setHighContrast(bool value) async {
    state = state.copyWith(highContrast: value);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('high_contrast', value);
  }

  Future<void> setReduceAnimations(bool value) async {
    state = state.copyWith(reduceAnimations: value);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('reduce_animations', value);
  }

  Future<void> setScreenReaderOptimized(bool value) async {
    state = state.copyWith(screenReaderOptimized: value);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('screen_reader', value);
  }

  Future<void> setVoiceCommands(bool value) async {
    state = state.copyWith(enableVoiceCommands: value);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('voice_commands', value);
  }

  Future<void> setReadAloud(bool value) async {
    state = state.copyWith(enableReadAloud: value);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('read_aloud', value);
  }

  Future<void> setColorScheme(String scheme) async {
    state = state.copyWith(colorScheme: scheme);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('color_scheme', scheme);
  }

  Color getContrastColor(Color color) {
    if (!state.highContrast) return color;
    // High contrast adjustments
    if (color == Colors.white) return Colors.black;
    if (color == Colors.black) return Colors.white;
    return color.withOpacity(1.0);
  }
}

final accessibilityProvider = StateNotifierProvider<AccessibilityNotifier, AccessibilitySettings>((ref) {
  return AccessibilityNotifier();
});
