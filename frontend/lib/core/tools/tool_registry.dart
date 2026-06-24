import 'package:flutter/material.dart';

import '../theme.dart';

/// Status of a tool's backend implementation.
///
/// - [implemented] — backend `task_type` exists; user can upload + process now.
/// - [comingSoon] — frontend page exists but backend work is pending. Cards
///   still land on a unique page specific to the tool (not the merge/convert
///   fallback) so users see a meaningful "coming soon" experience per tool.
enum ToolStatus { implemented, comingSoon }

/// Behavior flags for the upload UI on a [ToolPage].
///
/// - [singlePdf]   — accepts one PDF file.
/// - [multiplePdf] — accepts 2+ PDF files (e.g. merge).
/// - [imageToPdf]  — accepts one or more images and emits a single PDF.
enum ToolAcceptMode { singlePdf, multiplePdf, imageToPdf, htmlOrPdf }

/// Configuration for a single PDF tool. One entry per card on the home grid.
/// Each tool has a unique URL slug so the routing layer can render the
/// correct page without falling back to a generic "merge" or "convert"
/// default.
@immutable
class ToolConfig {
  /// URL-safe identifier. Used in `/tools/<id>` and as the lookup key in
  /// [ToolRegistry]. Never change once shipped (would break shared links).
  final String id;

  /// Human-readable title shown in the card, app bar, and page header.
  final String title;

  /// One-line description shown under the title on the card.
  final String description;

  /// Long-form description for the tool page header. Falls back to
  /// [description] if not set.
  final String? longDescription;

  /// Material icon shown on the card and in the app bar.
  final IconData icon;

  /// Brand color. Usually matches the category color for visual grouping.
  final Color color;

  /// Top-level grouping used by the home category chips.
  /// One of: 'Organize', 'Optimize', 'Convert', 'Edit', 'Security', 'AI'.
  final String category;

  /// Backend `task_type` understood by `backend/app/services/celery_tasks.py`.
  /// `null` when the backend doesn't support this tool yet.
  final String? taskType;

  /// Page renderer behaviour. See [ToolAcceptMode].
  final ToolAcceptMode acceptMode;

  /// Current implementation status. Drives whether the page is a working
  /// upload UI or a "coming soon" placeholder.
  final ToolStatus status;

  const ToolConfig({
    required this.id,
    required this.title,
    required this.description,
    required this.icon,
    required this.color,
    required this.category,
    required this.taskType,
    required this.acceptMode,
    required this.status,
    this.longDescription,
  });
}

/// Static registry of all ProPDFs tools. Used by:
/// - Home screen card grid (each card binds its onTap to `routeFor(tool)`)
/// - Router (resolves `/tools/<id>` to the right page)
/// - Per-tool page widgets (reads display + behaviour from here)
class ToolRegistry {
  ToolRegistry._();

  /// All 35 tools, in the order they appear on the home grid (which is
  /// roughly the order in iLovePDF's catalog, grouped by category).
  /// The order is also the order of category chips when "All" is selected.
  static const List<ToolConfig> all = [
    // ---------- Organize ----------
    ToolConfig(
      id: 'merge',
      title: 'Merge PDF',
      description: 'Combine multiple PDFs into one file.',
      icon: Icons.merge_type,
      color: AppColors.catOrganize,
      category: 'Organize',
      taskType: 'merge',
      acceptMode: ToolAcceptMode.multiplePdf,
      status: ToolStatus.implemented,
    ),
    ToolConfig(
      id: 'split',
      title: 'Split PDF',
      description: 'Extract or split pages from your PDF.',
      icon: Icons.call_split,
      color: AppColors.catOrganize,
      category: 'Organize',
      taskType: 'split',
      acceptMode: ToolAcceptMode.singlePdf,
      status: ToolStatus.implemented,
    ),
    ToolConfig(
      id: 'organize-pages',
      title: 'Organize PDF',
      description: 'Reorder pages visually with drag & drop.',
      longDescription: 'Drag & drop pages to reorder, then export a new PDF '
          'with your custom page order.',
      icon: Icons.dashboard_customize,
      color: AppColors.catOrganize,
      category: 'Organize',
      taskType: 'organize_pages',
      acceptMode: ToolAcceptMode.singlePdf,
      status: ToolStatus.implemented,
    ),
    ToolConfig(
      id: 'remove-pages',
      title: 'Remove pages',
      description: 'Delete unwanted pages from your PDF.',
      longDescription: 'Select the pages you want to delete and download a '
          'cleaner version of your PDF.',
      icon: Icons.delete_sweep,
      color: AppColors.catOrganize,
      category: 'Organize',
      taskType: 'remove_pages',
      acceptMode: ToolAcceptMode.singlePdf,
      status: ToolStatus.implemented,
    ),
    ToolConfig(
      id: 'extract-pages',
      title: 'Extract pages',
      description: 'Save specific pages as a new PDF.',
      longDescription: 'Pick the pages you want to keep and download them as '
          'a brand-new PDF.',
      icon: Icons.content_copy,
      color: AppColors.catOrganize,
      category: 'Organize',
      taskType: 'extract',
      acceptMode: ToolAcceptMode.singlePdf,
      status: ToolStatus.implemented,
    ),

    // ---------- Optimize ----------
    ToolConfig(
      id: 'compress',
      title: 'Compress PDF',
      description: 'Reduce file size while keeping quality.',
      icon: Icons.compress,
      color: AppColors.catOptimize,
      category: 'Optimize',
      taskType: 'compress',
      acceptMode: ToolAcceptMode.singlePdf,
      status: ToolStatus.implemented,
    ),
    ToolConfig(
      id: 'repair',
      title: 'Repair PDF',
      description: 'Recover damaged or unreadable PDFs.',
      longDescription: 'Upload a damaged or corrupt PDF. We\'ll rebuild the '
          'internal structure (cross-reference table, object streams, page '
          'tree) and re-serialise the file so it opens reliably again. '
          'Processed entirely in your browser — your file never leaves the device.',
      icon: Icons.build,
      color: AppColors.catOptimize,
      category: 'Optimize',
      taskType: null,
      acceptMode: ToolAcceptMode.singlePdf,
      status: ToolStatus.implemented,
    ),
    ToolConfig(
      id: 'ocr',
      title: 'OCR PDF',
      description: 'Make scanned PDFs searchable with OCR.',
      longDescription: 'Run text recognition on a scanned PDF and download a '
          'searchable version with an invisible text layer. Runs entirely in '
          'your browser using Tesseract.js — your file never leaves the device.',
      icon: Icons.document_scanner,
      color: AppColors.catOptimize,
      category: 'Optimize',
      taskType: null,
      acceptMode: ToolAcceptMode.singlePdf,
      status: ToolStatus.implemented,
    ),

    // ---------- Convert to PDF ----------
    ToolConfig(
      id: 'word-to-pdf',
      title: 'Word to PDF',
      description: 'Convert .docx files to PDF.',
      longDescription: 'Upload a Microsoft Word document and download a PDF '
          'that preserves fonts, images, and layout.',
      icon: Icons.description,
      color: AppColors.catConvertTo,
      category: 'Convert',
      taskType: 'word_to_pdf',
      acceptMode: ToolAcceptMode.singlePdf, // accepts .docx — see note
      status: ToolStatus.implemented,
    ),
    ToolConfig(
      id: 'excel-to-pdf',
      title: 'Excel to PDF',
      description: 'Convert .xlsx files to PDF.',
      longDescription: 'Upload an Excel spreadsheet and download a paginated '
          'PDF — perfect for sharing reports. Note: LibreOffice Calc '
          'cannot parse Writer-style HTML on import, so complex '
          'spreadsheets may not convert cleanly.',
      icon: Icons.table_chart,
      color: AppColors.catConvertTo,
      category: 'Convert',
      taskType: null,
      acceptMode: ToolAcceptMode.singlePdf,
      status: ToolStatus.comingSoon,
    ),
    ToolConfig(
      id: 'ppt-to-pdf',
      title: 'PowerPoint to PDF',
      description: 'Convert .pptx files to PDF.',
      longDescription: 'Upload a PowerPoint deck and download a PDF version '
          'with one slide per page.',
      icon: Icons.slideshow,
      color: AppColors.catConvertTo,
      category: 'Convert',
      taskType: 'ppt_to_pdf',
      acceptMode: ToolAcceptMode.singlePdf,
      status: ToolStatus.implemented,
    ),
    ToolConfig(
      id: 'jpg-to-pdf',
      title: 'JPG to PDF',
      description: 'Convert images to a single PDF.',
      longDescription: 'Upload one or more JPG / PNG images and download '
          'them bundled into a single PDF document.',
      icon: Icons.image,
      color: AppColors.catConvertTo,
      category: 'Convert',
      taskType: 'images_to_pdf',
      acceptMode: ToolAcceptMode.imageToPdf,
      status: ToolStatus.implemented,
    ),
    ToolConfig(
      id: 'html-to-pdf',
      title: 'HTML to PDF',
      description: 'Convert web pages to PDF.',
      longDescription: 'Paste a URL or upload an .html file and download a '
          'pixel-perfect PDF rendering.',
      icon: Icons.code,
      color: AppColors.catConvertTo,
      category: 'Convert',
      taskType: 'html_to_pdf',
      acceptMode: ToolAcceptMode.htmlOrPdf,
      status: ToolStatus.implemented,
    ),

    // ---------- Convert from PDF ----------
    ToolConfig(
      id: 'pdf-to-word',
      title: 'PDF to Word',
      description: 'Convert PDFs to editable .docx.',
      longDescription: 'Upload a PDF and download an editable Microsoft Word '
          'document with text, lists, and basic formatting preserved.',
      icon: Icons.picture_as_pdf,
      color: AppColors.catConvertFrom,
      category: 'Convert',
      taskType: 'pdf_to_word',
      acceptMode: ToolAcceptMode.singlePdf,
      status: ToolStatus.implemented,
    ),
    ToolConfig(
      id: 'pdf-to-excel',
      title: 'PDF to Excel',
      description: 'Extract tables as editable .xlsx.',
      longDescription: 'Upload a PDF with tables and download an editable '
          'Excel workbook. Note: LibreOffice Calc cannot import PDFs '
          'meaningfully, so output tables will be empty for most '
          'inputs. Use a different tool for tabular extraction.',
      icon: Icons.picture_as_pdf,
      color: AppColors.catConvertFrom,
      category: 'Convert',
      taskType: 'pdf_to_excel',
      acceptMode: ToolAcceptMode.singlePdf,
      status: ToolStatus.implemented,
    ),
    ToolConfig(
      id: 'pdf-to-ppt',
      title: 'PDF to PowerPoint',
      description: 'Convert PDFs to .pptx slides.',
      longDescription: 'Upload a PDF and download an editable PowerPoint '
          'deck with one slide per page.',
      icon: Icons.picture_as_pdf,
      color: AppColors.catConvertFrom,
      category: 'Convert',
      taskType: 'pdf_to_ppt',
      acceptMode: ToolAcceptMode.singlePdf,
      status: ToolStatus.implemented,
    ),
    ToolConfig(
      id: 'pdf-to-jpg',
      title: 'PDF to JPG',
      description: 'Extract each page as an image.',
      longDescription: 'Upload a PDF and download each page as a separate '
          'JPG image, perfect for slides and social posts.',
      icon: Icons.photo_library,
      color: AppColors.catConvertFrom,
      category: 'Convert',
      taskType: 'convert_to_images',
      acceptMode: ToolAcceptMode.singlePdf,
      status: ToolStatus.implemented,
    ),

    // ---------- Edit ----------
    ToolConfig(
      id: 'edit',
      title: 'Edit PDF',
      description: 'Add text, shapes, comments to any PDF.',
      longDescription: 'Open a PDF in our in-browser editor to add text '
          'overlays, shapes (rectangles, ellipses, lines), highlights, '
          'images, and comments. Downloads as a new PDF.',
      icon: Icons.edit,
      color: AppColors.catEdit,
      category: 'Edit',
      taskType: null,
      acceptMode: ToolAcceptMode.singlePdf,
      status: ToolStatus.implemented,
    ),
    ToolConfig(
      id: 'rotate',
      title: 'Rotate PDF',
      description: 'Rotate pages to any angle.',
      icon: Icons.rotate_right,
      color: AppColors.catEdit,
      category: 'Edit',
      taskType: 'rotate',
      acceptMode: ToolAcceptMode.singlePdf,
      status: ToolStatus.implemented,
    ),
    ToolConfig(
      id: 'watermark',
      title: 'Watermark',
      description: 'Add text or image watermarks.',
      icon: Icons.water_drop,
      color: AppColors.catEdit,
      category: 'Edit',
      taskType: 'watermark',
      acceptMode: ToolAcceptMode.singlePdf,
      status: ToolStatus.implemented,
    ),
    ToolConfig(
      id: 'page-numbers',
      title: 'Page numbers',
      description: 'Stamp page numbers anywhere.',
      longDescription: 'Stamp page numbers on every page of your PDF. '
          'Choose position, format, and starting number.',
      icon: Icons.format_list_numbered,
      color: AppColors.catEdit,
      category: 'Edit',
      taskType: 'add_page_numbers',
      acceptMode: ToolAcceptMode.singlePdf,
      status: ToolStatus.implemented,
    ),
    ToolConfig(
      id: 'crop',
      title: 'Crop PDF',
      description: 'Adjust margins and trim pages.',
      longDescription: 'Crop every page of your PDF to a custom rectangle '
          '— useful for removing headers, footers, or margins. Pick the '
          'trim amount in each direction and the new boundary is applied '
          'to every page.',
      icon: Icons.crop,
      color: AppColors.catEdit,
      category: 'Edit',
      // pikepdf rewrites MediaBox per page. Params: {"margins": {top,
      // right, bottom, left}} OR {"rect": [x0, y0, x1, y1]}. The
      // dedicated CropPdfPage collects the margins from the user.
      taskType: 'crop',
      acceptMode: ToolAcceptMode.singlePdf,
      status: ToolStatus.implemented,
    ),
    ToolConfig(
      id: 'sign',
      title: 'eSign PDF',
      description: 'Draw, type, or upload a signature.',
      longDescription: 'Draw, type, or upload your signature, then place it '
          'anywhere on the document and download a signed copy. Your signature '
          'is rendered into the PDF — no external signing service required.',
      icon: Icons.draw,
      color: AppColors.catEdit,
      category: 'Edit',
      taskType: null,
      acceptMode: ToolAcceptMode.singlePdf,
      status: ToolStatus.implemented,
    ),
    ToolConfig(
      id: 'comment',
      title: 'Comment PDF',
      description: 'Add sticky notes and review comments.',
      longDescription: 'Open a PDF and add sticky-note comments anywhere on '
          'the page. Each comment is anchored to coordinates, so it survives '
          'page resizes. Download the commented PDF or export the comments '
          'as a Markdown list.',
      icon: Icons.comment_outlined,
      color: AppColors.catEdit,
      category: 'Edit',
      taskType: null,
      acceptMode: ToolAcceptMode.singlePdf,
      status: ToolStatus.implemented,
    ),
    ToolConfig(
      id: 'compare',
      title: 'Compare PDF',
      description: 'Highlight differences between two files.',
      longDescription: 'Upload two PDFs and download a comparison report '
          'highlighting every difference.',
      icon: Icons.compare,
      color: AppColors.catEdit,
      category: 'Edit',
      taskType: null,
      acceptMode: ToolAcceptMode.singlePdf,
      status: ToolStatus.comingSoon,
    ),

    // ---------- Security ----------
    ToolConfig(
      id: 'protect',
      title: 'Protect PDF',
      description: 'Add a password to lock your PDF.',
      longDescription: 'Encrypt your PDF with AES-256 + a password so only '
          'people who know it can open the file. Owner password is set to '
          'match the user password by default — pass a separate one if you '
          'want viewers to be locked out of permission changes.',
      icon: Icons.lock,
      color: AppColors.catSecurity,
      category: 'Security',
      // pikepdf.Encryption(owner, user, aes=True, R=6). Params:
      // {"user_password": "...", "owner_password": "..." (optional)}.
      taskType: 'protect',
      acceptMode: ToolAcceptMode.singlePdf,
      status: ToolStatus.implemented,
    ),
    ToolConfig(
      id: 'unlock',
      title: 'Unlock PDF',
      description: 'Remove the password from a PDF.',
      longDescription: 'Upload a password-protected PDF (you must know the '
          'password) and download an unprotected copy. Uses AES-256 + '
          'qpdf under the hood; works on every modern PDF.',
      icon: Icons.lock_open,
      color: AppColors.catSecurity,
      category: 'Security',
      // pikepdf.open(..., password=...). Params: {"password": "..."}.
      taskType: 'unlock',
      acceptMode: ToolAcceptMode.singlePdf,
      status: ToolStatus.implemented,
    ),
    ToolConfig(
      id: 'redact',
      title: 'Redact PDF',
      description: 'Permanently black out sensitive content.',
      longDescription: 'Permanently black out text or images so the '
          'underlying data can\'t be recovered. True redaction: '
          'every matching term is replaced with a black rectangle '
          'AND the page is rasterised so the original text is '
          'destroyed, not just covered. Multi-word phrases work '
          '("John Smith").',
      icon: Icons.visibility_off,
      color: AppColors.catSecurity,
      category: 'Security',
      // pikepdf-driven: pymupdf search_for() locates the matches
      // by bbox, then we rasterise the page and burn black
      // rectangles onto the image. params is {"terms": [...]}.
      taskType: 'redact',
      acceptMode: ToolAcceptMode.singlePdf,
      status: ToolStatus.implemented,
    ),
    ToolConfig(
      id: 'pdfa',
      title: 'PDF to PDF/A',
      description: 'Convert to archival-grade PDF/A format.',
      longDescription: 'Convert your PDF to PDF/A — the ISO-standard archival '
          'format that preserves visual fidelity over decades.',
      icon: Icons.verified,
      color: AppColors.catSecurity,
      category: 'Security',
      taskType: null, // needs Ghostscript or veraPDF pipeline
      acceptMode: ToolAcceptMode.singlePdf,
      status: ToolStatus.comingSoon,
    ),

    // ---------- AI ----------
    ToolConfig(
      id: 'ai-summarize',
      title: 'AI Summarize',
      description: 'Get instant AI summaries of any PDF.',
      longDescription: 'Upload a PDF and get a concise AI-generated summary '
          'powered by Google Gemini. The page renders a structured '
          'summary (overview + key points + topics).',
      icon: Icons.auto_awesome,
      color: AppColors.catAi,
      category: 'AI',
      // Routed through /api/v1/ai/summarize (synchronous,
      // not the celery task pipeline). The dedicated page
      // handles the upload + result render.
      taskType: null,
      acceptMode: ToolAcceptMode.singlePdf,
      status: ToolStatus.implemented,
    ),
    ToolConfig(
      id: 'ai-translate',
      title: 'AI Translate',
      description: 'Translate PDFs into 25+ languages.',
      longDescription: 'Upload a PDF, pick a target language, and read '
          'the translated text. Powered by Gemini. (Translated text '
          'only — formatting, images, and tables are not preserved '
          'in this flow. Use "PDF to Word" or "PDF to Markdown" if '
          'you need a translated file you can save.)',
      icon: Icons.translate,
      color: AppColors.catAi,
      category: 'AI',
      taskType: null,
      acceptMode: ToolAcceptMode.singlePdf,
      status: ToolStatus.implemented,
    ),
    // Chat with PDF — kept on the existing /ai-chat route (different flow,
    // needs document id). Not registered under /tools/<id>.
    ToolConfig(
      id: 'ai-fill-forms',
      title: 'AI Fill Forms',
      description: 'Auto-fill PDF forms from context.',
      longDescription: 'Upload a PDF form, let Gemini suggest values for '
          'each AcroForm field based on the document\'s content, '
          'review + edit anything that looks wrong, then download '
          'the filled PDF. Two-step flow so you always see what '
          'the model wants to write before it lands in the file.',
      icon: Icons.assignment_turned_in,
      color: AppColors.catAi,
      category: 'AI',
      // Routed through /api/v1/ai/fill-forms (synchronous).
      taskType: null,
      acceptMode: ToolAcceptMode.singlePdf,
      status: ToolStatus.implemented,
    ),
    ToolConfig(
      id: 'ai-extract',
      title: 'AI Extract Data',
      description: 'Pull structured data from any PDF.',
      longDescription: 'Upload a PDF and Gemini will extract structured '
          'fields (named entities, key data, tables, contact info) '
          'as JSON.',
      icon: Icons.data_object,
      color: AppColors.catAi,
      category: 'AI',
      // Routed through /api/v1/ai/extract (synchronous).
      taskType: null,
      acceptMode: ToolAcceptMode.singlePdf,
      status: ToolStatus.implemented,
    ),
  ];

  /// Lookup by URL slug. Returns null when the slug isn't registered —
  /// callers should treat null as "render a 404".
  static ToolConfig? findById(String id) {
    for (final t in all) {
      if (t.id == id) return t;
    }
    return null;
  }

  /// Path for a tool. Stable, shareable.
  static String routeFor(ToolConfig tool) => '/tools/${tool.id}';

  /// Filter by category (case-sensitive, matches [ToolConfig.category]).
  static List<ToolConfig> byCategory(String category) =>
      all.where((t) => t.category == category).toList(growable: false);

  /// Top-level category names, in display order on the home chip row.
  static const List<String> categories = [
    'All',
    'Organize',
    'Optimize',
    'Convert',
    'Edit',
    'Security',
    'AI',
  ];
}
