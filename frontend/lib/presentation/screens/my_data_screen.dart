import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class MyDataScreen extends ConsumerWidget {
  const MyDataScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(title: const Text('My Data')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Your Data at ProPDFs',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Under GDPR, CCPA, and other privacy regulations, you have the right to know what data we hold about you. Here is a summary of your data stored in our systems.',
              style: TextStyle(color: Colors.grey[600], height: 1.5),
            ),
            const SizedBox(height: 24),
            _buildDataCard(
              context,
              icon: Icons.person_outline,
              title: 'Account Information',
              items: [
                'Email address',
                'Full name',
                'Profile avatar',
                'Plan tier',
                'Account creation date',
                'Last login date',
              ],
            ),
            _buildDataCard(
              context,
              icon: Icons.folder_outlined,
              title: 'Documents',
              items: [
                'Uploaded files (stored in Cloudflare R2)',
                'File metadata (name, size, page count)',
                'Processing history',
                'Document conversion records',
              ],
            ),
            _buildDataCard(
              context,
              icon: Icons.history,
              title: 'Usage Data',
              items: [
                'Login timestamps',
                'IP addresses',
                'Browser and device information',
                'Feature usage logs',
                'Processing actions taken',
              ],
            ),
            _buildDataCard(
              context,
              icon: Icons.credit_card_outlined,
              title: 'Payment Data',
              items: [
                'Billing information (via Stripe)',
                'Subscription history',
                'Invoice records',
                'Payment method tokens (Stripe)',
              ],
            ),
            const SizedBox(height: 24),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.primaryContainer.withOpacity(0.3),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Data Retention',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 8),
                  _buildRetentionItem('Account info', 'Until deletion + 30 days'),
                  _buildRetentionItem('Documents', '24 hours (unless saved)'),
                  _buildRetentionItem('Saved documents', 'Until deletion'),
                  _buildRetentionItem('Usage logs', '90 days'),
                  _buildRetentionItem('Payment records', '7 years (legal requirement)'),
                ],
              ),
            ),
            const SizedBox(height: 24),
            Text(
              'Download Your Data',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'You can export all your personal data in a machine-readable format. This includes your account information, document metadata, usage logs, and settings.',
              style: TextStyle(color: Colors.grey[600], height: 1.5),
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                FilledButton.icon(
                  onPressed: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Data export started. You will receive an email when ready.'),
                        backgroundColor: Colors.green,
                      ),
                    );
                  },
                  icon: const Icon(Icons.download),
                  label: const Text('Export as JSON'),
                ),
                OutlinedButton.icon(
                  onPressed: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Data export started. You will receive an email when ready.'),
                        backgroundColor: Colors.green,
                      ),
                    );
                  },
                  icon: const Icon(Icons.table_chart),
                  label: const Text('Export as CSV'),
                ),
                OutlinedButton.icon(
                  onPressed: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Data export started. You will receive an email when ready.'),
                        backgroundColor: Colors.green,
                      ),
                    );
                  },
                  icon: const Icon(Icons.picture_as_pdf),
                  label: const Text('Export as PDF'),
                ),
              ],
            ),
            const SizedBox(height: 24),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.red[50],
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.red[200]!),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.warning_amber, color: Colors.red[700]),
                      const SizedBox(width: 8),
                      Text(
                        'Want to delete your data?',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color: Colors.red[800],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'You can permanently delete your account and all associated data. This action cannot be undone.',
                    style: TextStyle(color: Colors.red[800], fontSize: 12, height: 1.5),
                  ),
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: () => context.push('/delete-account'),
                    style: FilledButton.styleFrom(backgroundColor: Colors.red),
                    child: const Text('Delete Account & Data'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 48),
          ],
        ),
      ),
    );
  }

  Widget _buildDataCard(BuildContext context, {
    required IconData icon,
    required String title,
    required List<String> items,
  }) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, color: Theme.of(context).colorScheme.primary),
                const SizedBox(width: 8),
                Text(
                  title,
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            ...items.map((item) => Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.check_circle, size: 14, color: Colors.grey[400]),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      item,
                      style: TextStyle(fontSize: 13, color: Colors.grey[700]),
                    ),
                  ),
                ],
              ),
            )),
          ],
        ),
      ),
    );
  }

  Widget _buildRetentionItem(String label, String period) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(fontSize: 13, color: Colors.grey[700])),
          Text(period, style: TextStyle(fontSize: 13, color: Colors.grey[500])),
        ],
      ),
    );
  }
}
