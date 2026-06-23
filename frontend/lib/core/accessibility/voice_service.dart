import 'package:flutter_tts/flutter_tts.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;
import 'package:speech_to_text/speech_recognition_result.dart';
import 'package:flutter/material.dart';

class VoiceService {
  final FlutterTts _tts = FlutterTts();
  final stt.SpeechToText _speech = stt.SpeechToText();
  bool _speechInitialized = false;
  bool _ttsInitialized = false;

  // No constructor side-effects. Hitting FlutterTts platform channels in
  // the constructor crashes widget tests (no plugin implementation), and
  // also races against app startup in production. The first `speak()` or
  // explicit `init()` call initializes lazily.
  VoiceService();

  /// Initialise TTS settings. Safe to call multiple times.
  Future<void> initTts() async {
    if (_ttsInitialized) return;
    try {
      await _tts.setLanguage('en-US');
      await _tts.setSpeechRate(0.5);
      await _tts.setVolume(1.0);
      await _tts.setPitch(1.0);
      _ttsInitialized = true;
    } catch (_) {
      // Plugin not available (e.g. widget test environment). Voice
      // features degrade silently — the UI keeps working.
    }
  }

  Future<void> setLanguage(String languageCode) async {
    await _tts.setLanguage(languageCode);
  }

  Future<void> speak(String text) async {
    if (text.isEmpty) return;
    await initTts();
    try {
      await _tts.stop();
      await _tts.speak(text);
    } catch (_) {
      // TTS not available — silent fallback.
    }
  }

  Future<void> stop() async {
    await _tts.stop();
  }

  Future<bool> initSpeech() async {
    if (_speechInitialized) return true;
    _speechInitialized = await _speech.initialize(
      onError: (error) => debugPrint('Speech error: $error'),
      onStatus: (status) => debugPrint('Speech status: $status'),
    );
    return _speechInitialized;
  }

  Future<void> startListening({required Function(String) onResult}) async {
    if (!_speechInitialized) {
      await initSpeech();
    }
    await _speech.listen(
      onResult: (SpeechRecognitionResult result) {
        if (result.finalResult) {
          onResult(result.recognizedWords);
        }
      },
      listenFor: const Duration(seconds: 30),
      pauseFor: const Duration(seconds: 3),
      partialResults: true,
    );
  }

  Future<void> stopListening() async {
    await _speech.stop();
  }

  bool get isListening => _speech.isListening;
  bool get isAvailable => _speechInitialized;

  // Voice command mapping
  void handleVoiceCommand(String command, BuildContext context) {
    final cmd = command.toLowerCase();
    if (cmd.contains('home') || cmd.contains('accueil') || cmd.contains('inicio')) {
      Navigator.of(context).pushNamed('/home');
    } else if (cmd.contains('upload') || cmd.contains('upload')) {
      Navigator.of(context).pushNamed('/tools');
    } else if (cmd.contains('scan') || cmd.contains('escanear') || cmd.contains('scanner')) {
      Navigator.of(context).pushNamed('/scan');
    } else if (cmd.contains('settings') || cmd.contains('configuración') || cmd.contains('paramètres')) {
      Navigator.of(context).pushNamed('/settings');
    } else if (cmd.contains('logout') || cmd.contains('cerrar') || cmd.contains('déconnexion')) {
      // Trigger logout via provider
    } else if (cmd.contains('help') || cmd.contains('ayuda') || cmd.contains('aide')) {
      // Show help dialog
    }
  }
}

final voiceServiceProvider = Provider<VoiceService>((ref) {
  return VoiceService();
});
