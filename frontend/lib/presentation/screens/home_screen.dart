import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/auth_provider.dart';
import '../../core/localization/app_localizations.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authStateProvider);
    final user = authState.value?.user;
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.get('app_name')),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_outlined),
            onPressed: () {},
          ),
          PopupMenuButton<String>(
            onSelected: (value) {
              if (value == 'logout') {
                ref.read(authStateProvider.notifier).logout();
              } else if (value == 'settings') {
                context.go('/settings');
              }
            },
            itemBuilder: (context) => [
              const PopupMenuItem(value: 'settings', child: Text('Settings')),
              const PopupMenuItem(value: 'logout', child: Text('Logout')),
            ],
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Hello, ${user?.fullName?.split(' ').first ?? 'User'}!',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'What would you like to do with your documents today?',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Colors.grey[600],
              ),
            ),
            const SizedBox(height: 24),

            // Beta Banner
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [Colors.blue[400]!, Colors.purple[400]!],
                ),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          l10n.get('beta_welcome'),
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 16,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          l10n.get('beta_full_access'),
                          style: const TextStyle(color: Colors.white70, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                  FilledButton(
                    onPressed: () => context.go('/beta'),
                    style: FilledButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: Colors.blue[700],
                    ),
                    child: const Text('Join Now'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // AI Features Row
            Text(
              l10n.get('ai_features'),
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 100,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: [
                  _buildAIFeatureCard(
                    context,
                    Icons.auto_awesome,
                    l10n.get('ai_summarize'),
                    Colors.orange,
                    () => context.go('/ai-chat'),
                  ),
                  _buildAIFeatureCard(
                    context,
                    Icons.translate,
                    l10n.get('ai_translate'),
                    Colors.blue,
                    () => context.go('/ai-chat'),
                  ),
                  _buildAIFeatureCard(
                    context,
                    Icons.chat_bubble,
                    l10n.get('chat_with_doc'),
                    Colors.green,
                    () => context.go('/ai-chat'),
                  ),
                  _buildAIFeatureCard(
                    context,
                    Icons.document_scanner,
                    l10n.get('ocr'),
                    Colors.purple,
                    () => context.go('/scan'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Quick Actions Grid
            Text(
              l10n.get('tools'),
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 12),
            GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: 2,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              childAspectRatio: 1.2,
              children: [
                _buildToolCard(
                  context,
                  icon: Icons.merge_type,
                  title: l10n.get('merge_pdfs'),
                  subtitle: 'Combine multiple files',
                  color: Colors.blue,
                  onTap: () => context.go('/tools', extra: 'merge'),
                ),
                _buildToolCard(
                  context,
                  icon: Icons.call_split,
                  title: l10n.get('split_pdf'),
                  subtitle: 'Extract pages',
                  color: Colors.green,
                  onTap: () => context.go('/tools', extra: 'split'),
                ),
                _buildToolCard(
                  context,
                  icon: Icons.compress,
                  title: l10n.get('compress'),
                  subtitle: 'Reduce file size',
                  color: Colors.orange,
                  onTap: () => context.go('/tools', extra: 'compress'),
                ),
                _buildToolCard(
                  context,
                  icon: Icons.rotate_right,
                  title: l10n.get('rotate'),
                  subtitle: 'Change orientation',
                  color: Colors.purple,
                  onTap: () => context.go('/tools', extra: 'rotate'),
                ),
                _buildToolCard(
                  context,
                  icon: Icons.water_drop,
                  title: l10n.get('watermark'),
                  subtitle: 'Add text overlay',
                  color: Colors.teal,
                  onTap: () => context.go('/tools', extra: 'watermark'),
                ),
                _buildToolCard(
                  context,
                  icon: Icons.transform,
                  title: l10n.get('convert'),
                  subtitle: 'PDF to images',
                  color: Colors.indigo,
                  onTap: () => context.go('/tools', extra: 'convert'),
                ),
              ],
            ),

            const SizedBox(height: 24),

            // Recent Documents
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  l10n.get('recent_documents'),
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                TextButton(
                  onPressed: () => context.go('/documents'),
                  child: Text(l10n.get('view_all')),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Card(
              child: ListTile(
                leading: CircleAvatar(
                  backgroundColor: Colors.red[50],
                  child: Icon(Icons.picture_as_pdf, color: Colors.red[400]),
                ),
                title: const Text('Sample Document.pdf'),
                subtitle: Text('2.4 MB • 12 pages', style: TextStyle(color: Colors.grey[500])),
                trailing: const Icon(Icons.more_vert),
              ),
            ),
            const SizedBox(height: 8),
            Card(
              child: ListTile(
                leading: CircleAvatar(
                  backgroundColor: Colors.blue[50],
                  child: Icon(Icons.description, color: Colors.blue[400]),
                ),
                title: const Text('Report.docx'),
                subtitle: Text('1.1 MB', style: TextStyle(color: Colors.grey[500])),
                trailing: const Icon(Icons.more_vert),
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: 0,
        onDestinationSelected: (index) {
          switch (index) {
            case 0:
              break;
            case 1:
              context.go('/documents');
              break;
            case 2:
              context.go('/tools');
              break;
            case 3:
              context.go('/settings');
              break;
          }
        },
        destinations: [
          NavigationDestination(icon: const Icon(Icons.home), label: l10n.get('home')),
          NavigationDestination(icon: const Icon(Icons.folder), label: l10n.get('files')),
          NavigationDestination(icon: const Icon(Icons.build), label: l10n.get('tools')),
          NavigationDestination(icon: const Icon(Icons.settings), label: l10n.get('settings')),
        ],
      ),
    );
  }

  Widget _buildToolCard(
    BuildContext context, {
    required IconData icon,
    required String title,
    required String subtitle,
    required Color color,
    required VoidCallback onTap,
  }) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: color.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, color: color, size: 24),
              ),
              const Spacer(),
              Text(
                title,
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                subtitle,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Colors.grey[500],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildAIFeatureCard(
    BuildContext context,
    IconData icon,
    String title,
    Color color,
    VoidCallback onTap,
  ) {
    return Container(
      width: 120,
      margin: const EdgeInsets.only(right: 12),
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, color: color, size: 28),
                const SizedBox(height: 8),
                Text(
                  title,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                  textAlign: TextAlign.center,
                  maxLines: 2,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
