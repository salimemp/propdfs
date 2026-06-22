import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme.dart';

import '../../core/localization/app_localizations.dart';

class LanguageScreen extends ConsumerWidget {
  const LanguageScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;

    final languages = [
      {'code': 'en', 'name': 'English', 'flag': '🇺🇸'},
      {'code': 'es', 'name': 'Español', 'flag': '🇪🇸'},
      {'code': 'fr', 'name': 'Français', 'flag': '🇫🇷'},
      {'code': 'de', 'name': 'Deutsch', 'flag': '🇩🇪'},
      {'code': 'it', 'name': 'Italiano', 'flag': '🇮🇹'},
      {'code': 'pt', 'name': 'Português', 'flag': '🇵🇹'},
      {'code': 'ru', 'name': 'Русский', 'flag': '🇷🇺'},
      {'code': 'zh', 'name': '中文', 'flag': '🇨🇳'},
      {'code': 'ja', 'name': '日本語', 'flag': '🇯🇵'},
      {'code': 'ko', 'name': '한국어', 'flag': '🇰🇷'},
      {'code': 'ar', 'name': 'العربية', 'flag': '🇸🇦'},
      {'code': 'hi', 'name': 'हिन्दी', 'flag': '🇮🇳'},
      {'code': 'th', 'name': 'ไทย', 'flag': '🇹🇭'},
      {'code': 'vi', 'name': 'Tiếng Việt', 'flag': '🇻🇳'},
      {'code': 'pl', 'name': 'Polski', 'flag': '🇵🇱'},
      {'code': 'tr', 'name': 'Türkçe', 'flag': '🇹🇷'},
      {'code': 'nl', 'name': 'Nederlands', 'flag': '🇳🇱'},
      {'code': 'sv', 'name': 'Svenska', 'flag': '🇸🇪'},
      {'code': 'no', 'name': 'Norsk', 'flag': '🇳🇴'},
      {'code': 'da', 'name': 'Dansk', 'flag': '🇩🇰'},
      {'code': 'fi', 'name': 'Suomi', 'flag': '🇫🇮'},
      {'code': 'cs', 'name': 'Čeština', 'flag': '🇨🇿'},
      {'code': 'hu', 'name': 'Magyar', 'flag': '🇭🇺'},
      {'code': 'ro', 'name': 'Română', 'flag': '🇷🇴'},
      {'code': 'uk', 'name': 'Українська', 'flag': '🇺🇦'},
      {'code': 'he', 'name': 'עברית', 'flag': '🇮🇱'},
      {'code': 'el', 'name': 'Ελληνικά', 'flag': '🇬🇷'},
      {'code': 'bn', 'name': 'বাংলা', 'flag': '🇧🇩'},
      {'code': 'id', 'name': 'Bahasa Indonesia', 'flag': '🇮🇩'},
      {'code': 'ms', 'name': 'Bahasa Melayu', 'flag': '🇲🇾'},
      {'code': 'tl', 'name': 'Filipino', 'flag': '🇵🇭'},
      {'code': 'sw', 'name': 'Kiswahili', 'flag': '🇰🇪'},
      {'code': 'ta', 'name': 'தமிழ்', 'flag': '🇮🇳'},
      {'code': 'te', 'name': 'తెలుగు', 'flag': '🇮🇳'},
      {'code': 'mr', 'name': 'मराठी', 'flag': '🇮🇳'},
      {'code': 'gu', 'name': 'ગુજરાતી', 'flag': '🇮🇳'},
    ];

    return Scaffold(
        backgroundColor: AppColors.surfaceLight,
      appBar: AppBar(
        title: Text(l10n.get('language_select')),
      ),
      body: ListView.builder(
        itemCount: languages.length,
        itemBuilder: (context, index) {
          final lang = languages[index];
          final isSelected = Localizations.localeOf(context).languageCode == lang['code'];

          return ListTile(
            leading: Text(
              lang['flag']!,
              style: const TextStyle(fontSize: 24),
            ),
            title: Text(lang['name']!),
            subtitle: Text(lang['code']!.toUpperCase()),
            trailing: isSelected
                ? Icon(
                    Icons.check_circle,
                    color: Theme.of(context).colorScheme.primary,
                  )
                : null,
            onTap: () {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text('Language changed to ${lang['name']}'),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
