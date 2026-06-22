import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme.dart';

import '../../core/localization/app_localizations.dart';
import '../../core/accessibility/accessibility_provider.dart';
import '../../core/accessibility/voice_service.dart';

class AccessibilityScreen extends ConsumerStatefulWidget {
  const AccessibilityScreen({super.key});

  @override
  ConsumerState<AccessibilityScreen> createState() => _AccessibilityScreenState();
}

class _AccessibilityScreenState extends ConsumerState<AccessibilityScreen> {
  bool _isListening = false;

  Future<void> _toggleVoiceCommands() async {
    final voiceService = ref.read(voiceServiceProvider);
    // ignore: unused_local_variable
    final _accessibility = ref.read(accessibilityProvider.notifier);

    if (!voiceService.isAvailable) {
      await voiceService.initSpeech();
    }

    if (_isListening) {
      await voiceService.stopListening();
      setState(() => _isListening = false);
    } else {
      setState(() => _isListening = true);
      await voiceService.startListening(
        onResult: (text) {
          setState(() => _isListening = false);
          voiceService.handleVoiceCommand(text, context);
        },
      );
    }
  }

  Future<void> _testTTS() async {
    final voiceService = ref.read(voiceServiceProvider);
    final l10n = AppLocalizations.of(context)!;
    await voiceService.speak(l10n.get('welcome'));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final accessibility = ref.watch(accessibilityProvider);
    final notifier = ref.read(accessibilityProvider.notifier);

    return Scaffold(
        backgroundColor: AppColors.surfaceLight,
      appBar: AppBar(title: Text(l10n.get('accessibility'))),
      body: ListView(
        children: [
          // Voice Commands Section
          _buildSectionHeader(context, l10n.get('voice_commands')),
          SwitchListTile(
            title: Text(l10n.get('enable_voice_commands')),
            subtitle: Text(l10n.get('hint_voice')),
            value: accessibility.enableVoiceCommands,
            onChanged: (v) => notifier.setVoiceCommands(v),
            secondary: const Icon(Icons.mic),
          ),
          if (accessibility.enableVoiceCommands)
            ListTile(
              leading: Icon(
                _isListening ? Icons.mic : Icons.mic_none,
                color: _isListening ? Colors.red : null,
              ),
              title: Text(_isListening ? l10n.get('listening') : l10n.get('speak_now')),
              trailing: _isListening
                  ? const SizedBox(
                      width: 24,
                      height: 24,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : null,
              onTap: _toggleVoiceCommands,
            ),
          const Divider(),

          // Read Aloud Section
          _buildSectionHeader(context, l10n.get('read_aloud')),
          SwitchListTile(
            title: Text(l10n.get('enable_read_aloud')),
            subtitle: Text(l10n.get('hint_read_aloud')),
            value: accessibility.enableReadAloud,
            onChanged: (v) => notifier.setReadAloud(v),
            secondary: const Icon(Icons.volume_up),
          ),
          if (accessibility.enableReadAloud)
            ListTile(
              leading: const Icon(Icons.play_arrow),
              title: const Text('Test Text-to-Speech'),
              onTap: _testTTS,
            ),
          const Divider(),

          // Visual Settings
          _buildSectionHeader(context, l10n.get('accessibility_options')),
          ListTile(
            leading: const Icon(Icons.text_fields),
            title: Text(l10n.get('text_scale')),
            subtitle: Text(l10n.get('hint_text_scale')),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: SegmentedButton<double>(
              segments: [
                ButtonSegment(
                  value: 1.0,
                  label: Text(l10n.get('normal')),
                ),
                ButtonSegment(
                  value: 1.25,
                  label: Text(l10n.get('large')),
                ),
                ButtonSegment(
                  value: 1.5,
                  label: Text(l10n.get('extra_large')),
                ),
              ],
              selected: {accessibility.textScale},
              onSelectionChanged: (values) {
                if (values.isNotEmpty) {
                  notifier.setTextScale(values.first);
                }
              },
            ),
          ),
          const SizedBox(height: 16),
          SwitchListTile(
            title: Text(l10n.get('high_contrast')),
            subtitle: Text(l10n.get('hint_contrast')),
            value: accessibility.highContrast,
            onChanged: (v) => notifier.setHighContrast(v),
            secondary: const Icon(Icons.contrast),
          ),
          SwitchListTile(
            title: Text(l10n.get('reduce_animations')),
            value: accessibility.reduceAnimations,
            onChanged: (v) => notifier.setReduceAnimations(v),
            secondary: const Icon(Icons.animation),
          ),
          SwitchListTile(
            title: Text(l10n.get('screen_reader')),
            value: accessibility.screenReaderOptimized,
            onChanged: (v) => notifier.setScreenReaderOptimized(v),
            secondary: const Icon(Icons.accessibility_new),
          ),
          const Divider(),

          // Preview
          _buildSectionHeader(context, 'Preview'),
          Container(
            margin: const EdgeInsets.all(16),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: accessibility.highContrast
                  ? Colors.black
                  : Theme.of(context).colorScheme.surfaceContainerHighest,
              border: accessibility.highContrast
                  ? Border.all(color: Colors.white, width: 2)
                  : null,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              'This is a preview of how text will appear with your current accessibility settings.',
              style: TextStyle(
                fontSize: 16 * accessibility.textScale,
                color: accessibility.highContrast ? Colors.white : null,
                fontWeight: accessibility.highContrast ? FontWeight.bold : null,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(BuildContext context, String title) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Text(
        title,
        style: Theme.of(context).textTheme.labelLarge?.copyWith(
          color: Theme.of(context).colorScheme.primary,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
