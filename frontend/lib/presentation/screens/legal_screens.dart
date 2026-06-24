import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme.dart';


class PrivacyPolicyScreen extends ConsumerWidget {
  const PrivacyPolicyScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
        backgroundColor: AppColors.surfaceLight,
      appBar: AppBar(
        title: const Text('Privacy Policy'),
        actions: [
          IconButton(
            icon: const Icon(Icons.share),
            onPressed: () {},
          ),
        ],
      ),
      body: const SingleChildScrollView(
        padding: EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _SectionHeader(
              title: 'ProPDFs Privacy Policy',
              subtitle: 'Effective Date: January 1, 2026 | Last Updated: January 1, 2026',
            ),
            SizedBox(height: 24),
            _PolicySection(
              number: '1',
              title: 'Introduction',
              content: 'ProPDFs ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, store, share, and protect your personal information when you use our website, mobile applications, and document processing services.',
            ),
            _PolicySection(
              number: '2',
              title: 'Information We Collect',
              content: '''We collect information you voluntarily provide when you create an account, upload documents, subscribe to plans, or contact support. This includes email address, password, full name, billing information, and documents you process. We also automatically collect usage information such as IP address, device information, and log data.''',
            ),
            _PolicySection(
              number: '3',
              title: 'How We Use Your Information',
              content: '''We use your information to provide and maintain our Services, process your PDF conversions, authenticate your identity, communicate with you about your account, process payments, provide customer support, and improve our Services through aggregated, anonymized analytics.''',
            ),
            _PolicySection(
              number: '4',
              title: 'Cookies and Similar Technologies',
              content: '''We use essential cookies for basic functionality, functional cookies for preferences, analytics cookies for understanding usage, and advertising cookies only with your opt-in consent. You can manage cookies through our consent banner or browser settings.''',
            ),
            _PolicySection(
              number: '5',
              title: 'Data Sharing and Disclosure',
              content: '''ProPDFs does not sell your personal information or document content to third parties. We share information with trusted service providers including Cloudflare (CDN/storage), Stripe (payments), Google (AI/OAuth/Analytics), and GitHub (OAuth). All providers are bound by strict confidentiality agreements.''',
            ),
            _PolicySection(
              number: '6',
              title: 'Data Storage and Security',
              content: '''We implement AES-256 encryption at rest, TLS 1.3 for data in transit, JWT authentication, role-based access controls, and continuous security monitoring. Documents are automatically deleted after 24 hours unless saved to your account. Account information is retained until you delete your account.''',
            ),
            _PolicySection(
              number: '7',
              title: 'Your Privacy Rights',
              content: '''GDPR (EU/EEA): Right to access, rectification, erasure, restriction, portability, and objection. CCPA (California): Right to know, delete, and opt-out. We respond to all requests within 30 days. Contact privacy@propdfs.com to exercise your rights.''',
            ),
            _PolicySection(
              number: '8',
              title: 'Children\'s Privacy',
              content: 'Our Services are not intended for children under 16. We do not knowingly collect personal information from children under 16. If you believe your child has provided us with personal information, contact us immediately and we will delete it promptly.',
            ),
            _PolicySection(
              number: '9',
              title: 'International Data Transfers',
              content: 'Your information may be transferred to countries outside your jurisdiction. We ensure appropriate safeguards through Standard Contractual Clauses (SCCs) for EU data transfers and Data Processing Agreements with all service providers.',
            ),
            _PolicySection(
              number: '10',
              title: 'HIPAA Compliance',
              content: 'For healthcare documents containing PHI, we are willing to sign Business Associate Agreements (BAA). We implement technical safeguards required by HIPAA including encryption, access controls, and audit logs. Contact compliance@propdfs.com for BAA arrangements.',
            ),
            _PolicySection(
              number: '11',
              title: 'Changes to This Policy',
              content: 'We may update this Privacy Policy periodically. We will notify you of changes by posting the updated policy, sending email notifications for material changes, and displaying prominent notices for 30 days.',
            ),
            _PolicySection(
              number: '12',
              title: 'Contact Us',
              content: '''Email: privacy@propdfs.com\nDPO: dpo@propdfs.com\nAddress: ProPDFs Privacy Team, 123 Innovation Drive, San Francisco, CA 94105, USA\n\nThis Privacy Policy is compliant with GDPR, CCPA, ePrivacy Directive, PIPEDA, LGPD, and SOC 2 requirements.''',
            ),
            SizedBox(height: 48),
          ],
        ),
      ),
    );
  }
}

class TermsOfServiceScreen extends ConsumerWidget {
  const TermsOfServiceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Terms of Service'),
        actions: [
          IconButton(
            icon: const Icon(Icons.share),
            onPressed: () {},
          ),
        ],
      ),
      body: const SingleChildScrollView(
        padding: EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _SectionHeader(
              title: 'ProPDFs Terms of Service',
              subtitle: 'Effective Date: January 1, 2026 | Last Updated: January 1, 2026',
            ),
            SizedBox(height: 24),
            _PolicySection(
              number: '1',
              title: 'Acceptance of Terms',
              content: 'By accessing or using the Services, you agree to be bound by these Terms. If you do not agree to all these Terms, you may not access or use the Services. If you are using the Services on behalf of an organization, you represent that you have authority to bind that organization.',
            ),
            _PolicySection(
              number: '2',
              title: 'Eligibility',
              content: 'You must be at least 16 years old to use the Services. By using the Services, you represent that you are of legal age to form a binding contract, are not barred from using the Services under applicable law, and all registration information you submit is accurate and truthful.',
            ),
            _PolicySection(
              number: '3',
              title: 'Description of Services',
              content: 'ProPDFs provides cloud-based document processing tools including PDF creation, editing, merging, splitting, compressing, converting, OCR, AI-powered document analysis, cloud storage, team collaboration, and API access. We strive for 99.9% uptime but do not guarantee uninterrupted access.',
            ),
            _PolicySection(
              number: '4',
              title: 'User Accounts',
              content: '''To access certain features, you must create an account with a valid email and secure password. You are responsible for maintaining confidentiality of your credentials and all activities under your account. Notify us immediately of any unauthorized use. We may suspend accounts for violations, fraud, or non-payment.''',
            ),
            _PolicySection(
              number: '5',
              title: 'Acceptable Use Policy',
              content: '''You may use the Services for personal, educational, or business purposes. You may NOT use the Services for illegal content, copyright infringement, malware distribution, system abuse, unauthorized data mining, reselling without agreement, reverse engineering, fraud, or resource abuse that degrades service for others.''',
            ),
            _PolicySection(
              number: '6',
              title: 'Subscription Plans and Payments',
              content: '''Plans: Free (limited), Pro (\$9.99/mo), Business (\$19.99/mo), Enterprise (custom). Payments processed securely through Stripe. Subscription fees are non-refundable except where required by law. Cancellation takes effect at the end of the current billing period. Beta users receive 3 months full access.''',
            ),
            _PolicySection(
              number: '7',
              title: 'Intellectual Property',
              content: '''You retain ownership of documents you upload. We own all rights to the Services software, trademarks, and technology. You may not copy, modify, distribute, sell, or lease any part of our Services without permission. By providing feedback, you grant us a perpetual license to use it.''',
            ),
            _PolicySection(
              number: '8',
              title: 'Disclaimers and Limitations',
              content: '''THE SERVICES ARE PROVIDED "AS IS" WITHOUT WARRANTIES. We are not liable for indirect, incidental, special, consequential, or punitive damages. Total liability is limited to the amount you paid in the 12 months preceding the claim, or \$100 if you have not paid.''',
            ),
            _PolicySection(
              number: '9',
              title: 'Governing Law',
              content: 'These Terms are governed by California law. Disputes under \$10,000 are resolved through binding arbitration in San Francisco. For disputes exceeding \$10,000, jurisdiction is in San Francisco County courts. You agree to individual proceedings only, not class actions.',
            ),
            _PolicySection(
              number: '10',
              title: 'Termination',
              content: 'You may terminate your account at any time. We may suspend or terminate for violations, fraud, non-payment, or extended inactivity (12+ months). Upon termination, licenses granted by you terminate. Surviving provisions include intellectual property, indemnification, and liability limitations.',
            ),
            _PolicySection(
              number: '11',
              title: 'Contact Information',
              content: '''Legal: legal@propdfs.com\nDMCA: dmca@propdfs.com\nPrivacy: privacy@propdfs.com\nAddress: ProPDFs, Inc., 123 Innovation Drive, San Francisco, CA 94105, USA\n\nBY USING PROPDFS, YOU ACKNOWLEDGE THAT YOU HAVE READ, UNDERSTOOD, AND AGREE TO BE BOUND BY THESE TERMS.''',
            ),
            SizedBox(height: 48),
          ],
        ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  final String subtitle;

  const _SectionHeader({required this.title, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: Theme.of(context).textTheme.headlineMedium?.copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          subtitle,
          style: TextStyle(
            color: Colors.grey[600],
            fontSize: 14,
          ),
        ),
      ],
    );
  }
}

class _PolicySection extends StatelessWidget {
  final String number;
  final String title;
  final String content;

  const _PolicySection({
    required this.number,
    required this.title,
    required this.content,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.primaryContainer,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Center(
                  child: Text(
                    number,
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  title,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.only(left: 40),
            child: Text(
              content,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                height: 1.6,
                color: Colors.grey[800],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Cookies Policy — what we set in the browser, why, how to opt out.
class CookiesPolicyScreen extends ConsumerWidget {
  const CookiesPolicyScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      backgroundColor: AppColors.surfaceLight,
      appBar: AppBar(
        backgroundColor: AppColors.surfaceLight,
        title: const Text('Cookie Policy'),
      ),
      body: const SingleChildScrollView(
        padding: EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _SectionHeader(
              title: 'ProPDFs Cookie Policy',
              subtitle:
                  'Effective Date: January 1, 2026 | Last Updated: January 1, 2026',
            ),
            SizedBox(height: 24),
            _PolicySection(
              number: '1',
              title: 'What are cookies?',
              content:
                  'Cookies are small text files stored on your device by your browser when you visit a website. They are widely used to make sites work, improve performance, and provide information to the site operators. We use cookies and similar technologies (localStorage, IndexedDB, sessionStorage) for the purposes described below.',
            ),
            _PolicySection(
              number: '2',
              title: 'Strictly necessary cookies',
              content:
                  'These cookies are essential for the site to function. They include session tokens, CSRF tokens, and authentication cookies. Without them you cannot sign in, upload files, or use the PDF tools. The legal basis for these is our legitimate interest in providing a working service.',
            ),
            _PolicySection(
              number: '3',
              title: 'Preference cookies',
              content:
                  'These remember your choices — theme (light / dark), language, accessibility settings, the last tool you used. They make your repeat visits more pleasant. You can clear them from your browser at any time and the site will fall back to defaults.',
            ),
            _PolicySection(
              number: '4',
              title: 'Analytics cookies',
              content:
                  'We use Plausible Analytics, a privacy-friendly service that does not set cross-site tracking cookies. Plausible collects anonymised, aggregated page-view counts with no per-user identifiers. We never sell or share analytics data.',
            ),
            _PolicySection(
              number: '5',
              title: 'Cookies we do NOT use',
              content:
                  'No advertising cookies, no Facebook / Google ad-network pixels, no cross-site tracking. We do not embed third-party ad-tech on propdfs.com or in the mobile apps.',
            ),
            _PolicySection(
              number: '6',
              title: 'How to control cookies',
              content:
                  'You can block or delete cookies in your browser settings. The exact steps depend on your browser; common paths are Chrome → Settings → Privacy and security → Cookies, Safari → Preferences → Privacy, Firefox → Preferences → Privacy & Security. Blocking strictly necessary cookies will sign you out and break core functionality.',
            ),
            _PolicySection(
              number: '7',
              title: 'Changes to this policy',
              content:
                  'We may update this Cookie Policy from time to time. Material changes will be announced via a banner on the site and (for signed-in users) an in-product notice. The "Last Updated" date at the top of this page reflects the current version.',
            ),
            _PolicySection(
              number: '8',
              title: 'Contact',
              content:
                  'Questions about cookies? Email privacy@propdfs.com. We respond within 5 business days.',
            ),
            SizedBox(height: 48),
          ],
        ),
      ),
    );
  }
}
