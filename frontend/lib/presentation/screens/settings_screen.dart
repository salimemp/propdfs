import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';

import '../providers/auth_provider.dart';
import '../../core/localization/app_localizations.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authStateProvider);
    final user = authState.value?.user;
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
        backgroundColor: AppColors.surfaceLight,
      appBar: AppBar(title: Text(l10n.get('settings'))),
      body: ListView(
        children: [
          // Profile Section
          Container(
            padding: const EdgeInsets.all(24),
            child: Column(
              children: [
                CircleAvatar(
                  radius: 40,
                  backgroundColor: Theme.of(context).colorScheme.primaryContainer,
                  child: Text(
                    user?.fullName?.substring(0, 1).toUpperCase() ?? 'U',
                    style: TextStyle(
                      fontSize: 28,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  user?.fullName ?? 'User',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  user?.email ?? '',
                  style: TextStyle(color: Colors.grey[500]),
                ),
                const SizedBox(height: 8),
                Chip(
                  label: Text(
                    (user?.planTier ?? 'free').toUpperCase(),
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                  ),
                  backgroundColor: Theme.of(context).colorScheme.primaryContainer,
                  side: BorderSide.none,
                ),
              ],
            ),
          ),
          const Divider(),

          // Account Settings
          _buildSectionHeader(context, l10n.get('profile')),
          _buildListTile(
            context,
            icon: Icons.person_outline,
            title: 'Profile Information',
            onTap: () {},
          ),
          _buildListTile(
            context,
            icon: Icons.security,
            title: 'Security & Password',
            onTap: () {},
          ),
          _buildListTile(
            context,
            icon: Icons.verified_user_outlined,
            title: 'Two-Factor Authentication',
            onTap: () {},
          ),
          _buildListTile(
            context,
            icon: Icons.devices,
            title: 'Connected Devices',
            onTap: () {},
          ),
          const Divider(),

          // Beta Program
          _buildSectionHeader(context, l10n.get('beta_program')),
          _buildListTile(
            context,
            icon: Icons.rocket_launch,
            title: 'Beta Program',
            subtitle: 'Join our exclusive beta',
            onTap: () => context.go('/beta'),
          ),
          const Divider(),

          // Accessibility & Language
          _buildSectionHeader(context, l10n.get('accessibility')),
          _buildListTile(
            context,
            icon: Icons.accessibility_new,
            title: l10n.get('accessibility'),
            subtitle: 'Voice, contrast, text size',
            onTap: () => context.go('/accessibility'),
          ),
          _buildListTile(
            context,
            icon: Icons.language,
            title: l10n.get('language'),
            subtitle: '35+ languages supported',
            onTap: () => context.go('/language'),
          ),
          const Divider(),

          // Subscription
          _buildSectionHeader(context, l10n.get('subscription')),
          _buildListTile(
            context,
            icon: Icons.workspace_premium,
            title: 'Manage Plan',
            subtitle: 'Current: ${user?.planTier ?? 'Free'}',
            onTap: () {},
          ),
          _buildListTile(
            context,
            icon: Icons.receipt_long,
            title: 'Billing History',
            onTap: () {},
          ),
          const Divider(),

          // Preferences
          _buildSectionHeader(context, 'Preferences'),
          _buildListTile(
            context,
            icon: Icons.dark_mode,
            title: 'Appearance',
            subtitle: 'System default',
            onTap: () {},
          ),
          _buildListTile(
            context,
            icon: Icons.notifications_outlined,
            title: l10n.get('notifications'),
            onTap: () {},
          ),
          const Divider(),

          // Data Privacy & Compliance
          _buildSectionHeader(context, 'Data Privacy'),
          _buildListTile(
            context,
            icon: Icons.privacy_tip_outlined,
            title: 'Privacy Policy',
            subtitle: 'How we handle your data',
            onTap: () => context.push('/privacy-policy'),
          ),
          _buildListTile(
            context,
            icon: Icons.description_outlined,
            title: 'Terms of Service',
            subtitle: 'Rules and guidelines',
            onTap: () => context.push('/terms-of-service'),
          ),
          _buildListTile(
            context,
            icon: Icons.cookie_outlined,
            title: 'Cookie Policy',
            subtitle: 'Cookie preferences and info',
            onTap: () => context.push('/cookie-policy'),
          ),
          _buildListTile(
            context,
            icon: Icons.download_outlined,
            title: 'My Data',
            subtitle: 'View and export your data',
            onTap: () => context.push('/my-data'),
          ),
          _buildListTile(
            context,
            icon: Icons.delete_forever,
            title: 'Delete Account',
            subtitle: 'Permanently remove your data',
            onTap: () => context.push('/delete-account'),
          ),
          const Divider(),

          // Blog
          _buildSectionHeader(context, 'Resources'),
          _buildListTile(
            context,
            icon: Icons.article_outlined,
            title: 'Blog',
            subtitle: 'Tips, comparisons, and guides',
            onTap: () => context.push('/blog'),
          ),
          _buildListTile(
            context,
            icon: Icons.help_outline,
            title: 'Help Center',
            onTap: () {},
          ),
          const Divider(),

          // Logout
          ListTile(
            leading: const Icon(Icons.logout, color: Colors.red),
            title: Text(l10n.get('logout'), style: const TextStyle(color: Colors.red)),
            onTap: () {
              showDialog(
                context: context,
                builder: (context) => AlertDialog(
                  title: Text(l10n.get('logout')),
                  content: const Text('Are you sure you want to logout?'),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: Text(l10n.get('cancel')),
                    ),
                    FilledButton(
                      onPressed: () {
                        ref.read(authStateProvider.notifier).logout();
                        Navigator.pop(context);
                      },
                      style: FilledButton.styleFrom(backgroundColor: Colors.red),
                      child: Text(l10n.get('logout')),
                    ),
                  ],
                ),
              );
            },
          ),
          const SizedBox(height: 32),
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

  Widget _buildListTile(
    BuildContext context, {
    required IconData icon,
    required String title,
    String? subtitle,
    required VoidCallback onTap,
  }) {
    return ListTile(
      leading: Icon(icon, color: Colors.grey[600]),
      title: Text(title),
      subtitle: subtitle != null ? Text(subtitle, style: TextStyle(color: Colors.grey[500])) : null,
      trailing: const Icon(Icons.chevron_right),
      onTap: onTap,
    );
  }
}
