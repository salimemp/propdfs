import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import '../providers/auth_provider.dart';
import '../widgets/app_footer.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authStateProvider);
    final isLoggedIn = authState.value?.user != null;
    final screenWidth = MediaQuery.of(context).size.width;
    final isWide = screenWidth >= 900;

    return Scaffold(
      backgroundColor: AppColors.surfaceLight,
      body: Column(
        children: [
          // Sticky header
          _Header(isLoggedIn: isLoggedIn),

          // Scrollable content
          Expanded(
            child: SingleChildScrollView(
              child: Column(
                children: [
                  _HeroSection(isWide: isWide),
                  const SizedBox(height: 64),
                  _ToolsSection(isWide: isWide),
                  const SizedBox(height: 80),
                  _WhyProPDFsSection(isWide: isWide),
                  const SizedBox(height: 80),
                  _TrustSection(isWide: isWide),
                  const SizedBox(height: 64),
                  const AppFooter(),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ---------- HEADER ----------

class _Header extends StatelessWidget {
  final bool isLoggedIn;
  const _Header({required this.isLoggedIn});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surfaceLight,
        border: Border(
          bottom: BorderSide(color: AppColors.borderLight, width: 1),
        ),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1200),
          child: Row(
            children: [
              // Logo
              InkWell(
                onTap: () => context.go('/home'),
                child: Row(
                  children: [
                    Container(
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [AppColors.primary, AppColors.accent],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Icon(
                        Icons.picture_as_pdf,
                        color: Colors.white,
                        size: 18,
                      ),
                    ),
                    const SizedBox(width: 10),
                    const Text(
                      'ProPDFs',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: AppColors.textLight,
                        letterSpacing: -0.3,
                      ),
                    ),
                  ],
                ),
              ),

              const Spacer(),

              // Nav links (desktop only)
              if (MediaQuery.of(context).size.width >= 700)
                Wrap(
                  spacing: 24,
                  children: [
                    _NavLink(label: 'All Tools', route: '/tools'),
                    _NavLink(label: 'Pricing', route: '/pricing'),
                    _NavLink(label: 'Blog', route: '/blog'),
                    _NavLink(label: 'About', route: '/about'),
                  ],
                ),

              const SizedBox(width: 24),

              // Auth buttons
              if (isLoggedIn)
                FilledButton.icon(
                  onPressed: () => context.go('/documents'),
                  icon: const Icon(Icons.dashboard, size: 18),
                  label: const Text('Dashboard'),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                  ),
                )
              else
                Wrap(
                  spacing: 8,
                  children: [
                    TextButton(
                      onPressed: () => context.go('/login'),
                      child: const Text('Log in'),
                    ),
                    FilledButton(
                      onPressed: () => context.go('/register'),
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.white,
                      ),
                      child: const Text('Sign up'),
                    ),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavLink extends StatelessWidget {
  final String label;
  final String route;
  const _NavLink({required this.label, required this.route});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => context.go(route),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
        child: Text(
          label,
          style: const TextStyle(
            color: AppColors.textLight,
            fontSize: 14,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
    );
  }
}

// ---------- HERO ----------

class _HeroSection extends StatelessWidget {
  final bool isWide;
  const _HeroSection({required this.isWide});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 80),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppColors.surfaceMutedLight,
            AppColors.surfaceLight,
          ],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 900),
          child: Column(
            children: [
              // Eyebrow badge
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                decoration: BoxDecoration(
                  color: AppColors.primary.withOpacity(0.08),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(
                    color: AppColors.primary.withOpacity(0.2),
                  ),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.bolt, size: 14, color: AppColors.primary),
                    SizedBox(width: 6),
                    Text(
                      'Every PDF tool. One place. Free forever.',
                      style: TextStyle(
                        color: AppColors.primary,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 32),

              // Big headline
              const Text(
                'Every PDF tool you need,',
                style: TextStyle(
                  fontSize: 56,
                  fontWeight: FontWeight.w800,
                  color: AppColors.textLight,
                  letterSpacing: -1.5,
                  height: 1.05,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              ShaderMask(
                shaderCallback: (rect) => const LinearGradient(
                  colors: [AppColors.primary, AppColors.accent],
                ).createShader(rect),
                child: const Text(
                  'all in one place.',
                  style: TextStyle(
                    fontSize: 56,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                    letterSpacing: -1.5,
                    height: 1.05,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),

              const SizedBox(height: 24),

              // Subtitle
              const Text(
                'Merge, split, compress, convert, edit, sign, and translate PDFs with just a few clicks. AI-powered. No installation. 100% private — files never leave your browser.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 18,
                  color: AppColors.textMutedLight,
                  height: 1.5,
                ),
              ),

              const SizedBox(height: 40),

              // CTAs
              Wrap(
                alignment: WrapAlignment.center,
                spacing: 12,
                runSpacing: 12,
                children: [
                  FilledButton.icon(
                    onPressed: () => context.go('/merge'),
                    icon: const Icon(Icons.merge_type),
                    label: const Text('Merge PDFs — Free'),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 18),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      textStyle: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  OutlinedButton.icon(
                    onPressed: () => context.go('/tools'),
                    icon: const Icon(Icons.apps),
                    label: const Text('Explore all 35 tools'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.textLight,
                      side: const BorderSide(color: AppColors.borderLight, width: 1.5),
                      padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 18),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      textStyle: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 56),

              // Trust strip
              Wrap(
                alignment: WrapAlignment.center,
                spacing: 32,
                runSpacing: 12,
                children: [
                  _TrustChip(icon: Icons.lock, text: 'End-to-end encrypted'),
                  _TrustChip(icon: Icons.speed, text: 'No upload limits'),
                  _TrustChip(icon: Icons.cloud_off, text: 'Files never stored'),
                  _TrustChip(icon: Icons.workspace_premium, text: 'GDPR compliant'),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TrustChip extends StatelessWidget {
  final IconData icon;
  final String text;
  const _TrustChip({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 16, color: AppColors.success),
        const SizedBox(width: 6),
        Text(
          text,
          style: const TextStyle(
            color: AppColors.textMutedLight,
            fontSize: 13,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }
}

// ---------- TOOLS GRID ----------

class _ToolsSection extends StatefulWidget {
  final bool isWide;
  const _ToolsSection({required this.isWide});

  @override
  State<_ToolsSection> createState() => _ToolsSectionState();
}

class _ToolsSectionState extends State<_ToolsSection> {
  String _activeCategory = 'All';

  static const _categories = ['All', 'Organize', 'Optimize', 'Convert', 'Edit', 'Security', 'AI'];

  @override
  Widget build(BuildContext context) {
    final filteredTools = _activeCategory == 'All'
        ? _allTools
        : _allTools.where((t) => t.category == _activeCategory).toList();

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1200),
          child: Column(
            children: [
              // Section title
              const Text(
                '35 PDF tools. One click each.',
                style: TextStyle(
                  fontSize: 36,
                  fontWeight: FontWeight.w800,
                  color: AppColors.textLight,
                  letterSpacing: -0.5,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              const Text(
                'Everything you need to work with PDFs — organized, fast, and free.',
                style: TextStyle(
                  fontSize: 16,
                  color: AppColors.textMutedLight,
                ),
                textAlign: TextAlign.center,
              ),

              const SizedBox(height: 32),

              // Category tabs
              Wrap(
                alignment: WrapAlignment.center,
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final cat in _categories)
                    _CategoryChip(
                      label: cat,
                      active: cat == _activeCategory,
                      onTap: () => setState(() => _activeCategory = cat),
                    ),
                ],
              ),

              const SizedBox(height: 40),

              // Tools grid (Wrap-based for Flutter web compatibility)
              Wrap(
                spacing: 16,
                runSpacing: 16,
                alignment: WrapAlignment.start,
                children: [
                  for (final tool in filteredTools) _ToolCard(tool: tool),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CategoryChip extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  const _CategoryChip({required this.label, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
        decoration: BoxDecoration(
          color: active ? AppColors.primary : AppColors.surfaceLight,
          border: Border.all(
            color: active ? AppColors.primary : AppColors.borderLight,
            width: 1.5,
          ),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: active ? Colors.white : AppColors.textLight,
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}

class _ToolCard extends StatelessWidget {
  final _ToolSpec tool;
  const _ToolCard({required this.tool});

  @override
  Widget build(BuildContext context) {
    final cardWidth = ((MediaQuery.of(context).size.width - 48 - 48 - (3 * 16)) / 4).clamp(160.0, 280.0);
    return SizedBox(
      width: cardWidth,
      height: 160,
      child: Material(
        color: AppColors.surfaceLight,
        elevation: 0,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: () => context.go(tool.route),
          borderRadius: BorderRadius.circular(12),
          child: Container(
            decoration: BoxDecoration(
              border: Border.all(color: AppColors.borderLight, width: 1),
              borderRadius: BorderRadius.circular(12),
            ),
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: tool.color.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(tool.icon, color: tool.color, size: 22),
                ),
                const SizedBox(height: 12),
                Text(
                  tool.title,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textLight,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                Text(
                  tool.description,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textMutedLight,
                    height: 1.3,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ToolSpec {
  final String title;
  final String description;
  final IconData icon;
  final Color color;
  final String route;
  final String category;
  const _ToolSpec(this.title, this.description, this.icon, this.color, this.route, this.category);
}

// Tool catalog. Used by category tabs on home and as data source for
// individual tool pages.
final List<_ToolSpec> _allTools = [
  // Organize (indigo)
  _ToolSpec('Merge PDF', 'Combine multiple PDFs into one file.', Icons.merge_type, AppColors.catOrganize, '/merge', 'Organize'),
  _ToolSpec('Split PDF', 'Extract or split pages from your PDF.', Icons.call_split, AppColors.catOrganize, '/split', 'Organize'),
  _ToolSpec('Organize PDF', 'Reorder pages visually with drag & drop.', Icons.dashboard_customize, AppColors.catOrganize, '/organize', 'Organize'),
  _ToolSpec('Remove pages', 'Delete unwanted pages from your PDF.', Icons.delete_sweep, AppColors.catOrganize, '/remove-pages', 'Organize'),
  _ToolSpec('Extract pages', 'Save specific pages as a new PDF.', Icons.content_copy, AppColors.catOrganize, '/extract', 'Organize'),

  // Optimize (cyan)
  _ToolSpec('Compress PDF', 'Reduce file size while keeping quality.', Icons.compress, AppColors.catOptimize, '/compress', 'Optimize'),
  _ToolSpec('Repair PDF', 'Recover damaged or unreadable PDFs.', Icons.build, AppColors.catOptimize, '/repair', 'Optimize'),
  _ToolSpec('OCR PDF', 'Make scanned PDFs searchable with OCR.', Icons.document_scanner, AppColors.catOptimize, '/ocr', 'Optimize'),

  // Convert to PDF (violet)
  _ToolSpec('Word to PDF', 'Convert .docx files to PDF.', Icons.description, AppColors.catConvertTo, '/word-to-pdf', 'Convert'),
  _ToolSpec('Excel to PDF', 'Convert .xlsx files to PDF.', Icons.table_chart, AppColors.catConvertTo, '/excel-to-pdf', 'Convert'),
  _ToolSpec('PowerPoint to PDF', 'Convert .pptx files to PDF.', Icons.slideshow, AppColors.catConvertTo, '/ppt-to-pdf', 'Convert'),
  _ToolSpec('JPG to PDF', 'Convert images to a single PDF.', Icons.image, AppColors.catConvertTo, '/jpg-to-pdf', 'Convert'),
  _ToolSpec('HTML to PDF', 'Convert web pages to PDF.', Icons.code, AppColors.catConvertTo, '/html-to-pdf', 'Convert'),

  // Convert from PDF (pink)
  _ToolSpec('PDF to Word', 'Convert PDFs to editable .docx.', Icons.picture_as_pdf, AppColors.catConvertFrom, '/pdf-to-word', 'Convert'),
  _ToolSpec('PDF to Excel', 'Extract tables as editable .xlsx.', Icons.picture_as_pdf, AppColors.catConvertFrom, '/pdf-to-excel', 'Convert'),
  _ToolSpec('PDF to PowerPoint', 'Convert PDFs to .pptx slides.', Icons.picture_as_pdf, AppColors.catConvertFrom, '/pdf-to-ppt', 'Convert'),
  _ToolSpec('PDF to JPG', 'Extract each page as an image.', Icons.photo_library, AppColors.catConvertFrom, '/pdf-to-jpg', 'Convert'),

  // Edit (amber)
  _ToolSpec('Edit PDF', 'Add text, shapes, comments to any PDF.', Icons.edit, AppColors.catEdit, '/edit', 'Edit'),
  _ToolSpec('Rotate PDF', 'Rotate pages to any angle.', Icons.rotate_right, AppColors.catEdit, '/rotate', 'Edit'),
  _ToolSpec('Watermark', 'Add text or image watermarks.', Icons.water_drop, AppColors.catEdit, '/watermark', 'Edit'),
  _ToolSpec('Page numbers', 'Stamp page numbers anywhere.', Icons.format_list_numbered, AppColors.catEdit, '/page-numbers', 'Edit'),
  _ToolSpec('Crop PDF', 'Adjust margins and trim pages.', Icons.crop, AppColors.catEdit, '/crop', 'Edit'),
  _ToolSpec('Sign PDF', 'Draw, type, or upload a signature.', Icons.draw, AppColors.catEdit, '/sign', 'Edit'),
  _ToolSpec('Compare PDF', 'Highlight differences between two files.', Icons.compare, AppColors.catEdit, '/compare-pdf', 'Edit'),

  // Security (emerald)
  _ToolSpec('Protect PDF', 'Add a password to lock your PDF.', Icons.lock, AppColors.catSecurity, '/protect', 'Security'),
  _ToolSpec('Unlock PDF', 'Remove the password from a PDF.', Icons.lock_open, AppColors.catSecurity, '/unlock', 'Security'),
  _ToolSpec('Redact PDF', 'Permanently black out sensitive content.', Icons.visibility_off, AppColors.catSecurity, '/redact', 'Security'),
  _ToolSpec('PDF to PDF/A', 'Convert to archival-grade PDF/A format.', Icons.verified, AppColors.catSecurity, '/pdfa', 'Security'),

  // AI (red)
  _ToolSpec('AI Summarize', 'Get instant AI summaries of any PDF.', Icons.auto_awesome, AppColors.catAi, '/ai/summarize', 'AI'),
  _ToolSpec('AI Translate', 'Translate PDFs into 25+ languages.', Icons.translate, AppColors.catAi, '/ai/translate', 'AI'),
  _ToolSpec('Chat with PDF', 'Ask questions, get cited answers.', Icons.chat_bubble_outline, AppColors.catAi, '/ai/chat', 'AI'),
  _ToolSpec('AI Fill Forms', 'Auto-fill PDF forms from context.', Icons.assignment_turned_in, AppColors.catAi, '/ai/fill-forms', 'AI'),
  _ToolSpec('AI Extract Data', 'Pull structured data from any PDF.', Icons.data_object, AppColors.catAi, '/ai/extract', 'AI'),
];

// ---------- WHY PROPDFS ----------

class _WhyProPDFsSection extends StatelessWidget {
  final bool isWide;
  const _WhyProPDFsSection({required this.isWide});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      color: AppColors.surfaceMutedLight,
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1200),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 80),
            child: Column(
              children: [
                const Text(
                  'Why ProPDFs',
                  style: TextStyle(
                    fontSize: 36,
                    fontWeight: FontWeight.w800,
                    color: AppColors.textLight,
                    letterSpacing: -0.5,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 12),
                const Text(
                  'Built for speed, privacy, and accessibility. No compromises.',
                  style: TextStyle(
                    fontSize: 16,
                    color: AppColors.textMutedLight,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 48),
                Wrap(
                  spacing: 24,
                  runSpacing: 24,
                  alignment: WrapAlignment.center,
                  children: const [
                    _FeatureCard(
                      icon: Icons.bolt,
                      color: AppColors.primary,
                      title: 'Lightning fast',
                      description: 'Native PDF processing on your device. Most tools complete in under 3 seconds.',
                    ),
                    _FeatureCard(
                      icon: Icons.shield,
                      color: AppColors.success,
                      title: 'Truly private',
                      description: 'Your files are processed locally or encrypted in transit. We never store or share them.',
                    ),
                    _FeatureCard(
                      icon: Icons.accessibility_new,
                      color: AppColors.accent,
                      title: 'Accessible by default',
                      description: 'WCAG 2.1 AA compliant. Full keyboard navigation, screen reader support, 25+ languages.',
                    ),
                    _FeatureCard(
                      icon: Icons.smart_toy,
                      color: AppColors.warning,
                      title: 'AI built in',
                      description: 'Summarize, translate, and chat with any PDF. Powered by Google Gemini with citations.',
                    ),
                    _FeatureCard(
                      icon: Icons.cloud_off,
                      color: AppColors.catConvertFrom,
                      title: 'Works offline',
                      description: 'Most tools work offline. Open the page once, use it forever — even on a plane.',
                    ),
                    _FeatureCard(
                      icon: Icons.workspace_premium,
                      color: AppColors.catOrganize,
                      title: 'Free to use',
                      description: 'Every basic tool is free, forever. No watermarks, no sign-up, no surprises.',
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _FeatureCard extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String title;
  final String description;
  const _FeatureCard({
    required this.icon,
    required this.color,
    required this.title,
    required this.description,
  });

  @override
  Widget build(BuildContext context) {
    final cardWidth = ((MediaQuery.of(context).size.width - 48 - 48 - (2 * 24)) / 3).clamp(220.0, 380.0);
    return SizedBox(
      width: cardWidth,
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: AppColors.surfaceLight,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.borderLight),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: color.withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: color, size: 24),
            ),
            const SizedBox(height: 16),
            Text(
              title,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: AppColors.textLight,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              description,
              style: const TextStyle(
                fontSize: 14,
                color: AppColors.textMutedLight,
                height: 1.5,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------- TRUST ----------

class _TrustSection extends StatelessWidget {
  final bool isWide;
  const _TrustSection({required this.isWide});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1000),
          child: Column(
            children: [
              const Text(
                'Trusted by professionals worldwide',
                style: TextStyle(
                  fontSize: 30,
                  fontWeight: FontWeight.w800,
                  color: AppColors.textLight,
                  letterSpacing: -0.5,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              const Text(
                'Used daily by 50,000+ professionals, students, and teams.',
                style: TextStyle(
                  fontSize: 16,
                  color: AppColors.textMutedLight,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 48),
              Wrap(
                alignment: WrapAlignment.center,
                spacing: 48,
                runSpacing: 24,
                children: const [
                  _Stat(label: 'PDFs processed', value: '5M+'),
                  _Stat(label: 'Active users', value: '50K+'),
                  _Stat(label: 'Countries', value: '180+'),
                  _Stat(label: 'Languages', value: '25+'),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  final String label;
  final String value;
  const _Stat({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 180,
      child: Column(
        children: [
          Text(
            value,
            style: const TextStyle(
              fontSize: 40,
              fontWeight: FontWeight.w800,
              color: AppColors.primary,
              letterSpacing: -1,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: const TextStyle(
              fontSize: 14,
              color: AppColors.textMutedLight,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
