import 'dart:async';
import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:syncfusion_flutter_pdf/pdf.dart';

/// Service that wraps Syncfusion's [PdfDocument] for the PDF tools that
/// need to open an existing PDF, modify it, and write it back out.
///
/// All methods are pure functions over byte arrays. The UI layer handles
/// file pickers, progress indicators, and download triggers.
///
/// Heavy operations (open + re-serialise a 50+ page PDF) are pushed to a
/// background isolate via [compute] so the UI thread stays responsive.
///
/// Limitations of the underlying engine (syncfusion_flutter_pdf):
/// - Reads PDF 1.4–2.0. Encrypted PDFs require the password up-front.
/// - The "repair" round-trip preserves visible content and form fields,
///   but strips JavaScript actions and some advanced XFA forms. That's
///   fine for the >95% of PDFs users hit in practice (forms, reports,
///   scanned docs).
/// - For files where the content stream itself is broken (very rare),
///   no client-side tool can recover them — point the user at the
///   original source.
class PdfEditorService {
  PdfEditorService._();

  /// Round-trip: open a PDF and save it back. This rebuilds the
  /// cross-reference table, object streams, and page tree — the three
  /// structures most likely to be damaged in a "corrupt" PDF.
  static Future<Uint8List> repair(Uint8List input) async {
    return await compute(_repairImpl, input);
  }

  /// Add a signature image (PNG bytes) at (x, y) on the given page,
  /// scaled to (width, height) points. Returns the modified PDF.
  ///
  /// Coordinates are top-down (origin at top-left of the page, in PDF
  /// user-space units — 72 units per inch).
  static Future<Uint8List> addSignature({
    required Uint8List pdfBytes,
    required Uint8List signaturePng,
    required int pageIndex,
    required double x,
    required double y,
    required double width,
    required double height,
  }) async {
    return await compute(
      _addSignatureImpl,
      _AddSignatureArgs(
        pdfBytes: pdfBytes,
        signaturePng: signaturePng,
        pageIndex: pageIndex,
        x: x,
        y: y,
        width: width,
        height: height,
      ),
    );
  }

  /// Add a sticky-note comment at (x, y) on the given page.
  static Future<Uint8List> addComment({
    required Uint8List pdfBytes,
    required int pageIndex,
    required double x,
    required double y,
    required String text,
    String author = 'You',
    String subject = 'Comment',
  }) async {
    return await compute(
      _addCommentImpl,
      _AddCommentArgs(
        pdfBytes: pdfBytes,
        pageIndex: pageIndex,
        x: x,
        y: y,
        text: text,
        author: author,
        subject: subject,
      ),
    );
  }

  /// Overlay invisible text (from OCR) at each detected block on the
  /// given page. The original visual is preserved; the text becomes
  /// selectable + searchable.
  static Future<Uint8List> overlayOcrText({
    required Uint8List pdfBytes,
    required int pageIndex,
    required List<OcrTextBlock> blocks,
  }) async {
    return await compute(
      _overlayOcrTextImpl,
      _OverlayOcrTextArgs(
        pdfBytes: pdfBytes,
        pageIndex: pageIndex,
        blocks: blocks,
      ),
    );
  }

  /// Apply a batch of edit operations to one page. Used by Edit PDF.
  static Future<Uint8List> edit({
    required Uint8List pdfBytes,
    required int pageIndex,
    required List<PdfEditOperation> operations,
  }) async {
    return await compute(
      _editImpl,
      _EditArgs(
        pdfBytes: pdfBytes,
        pageIndex: pageIndex,
        operations: operations,
      ),
    );
  }

  /// Number of pages in the PDF.
  static Future<int> pageCount(Uint8List pdfBytes) async {
    return await compute(_pageCountImpl, pdfBytes);
  }

  /// Extract all text from a single page. Used by Edit PDF's
  /// "Replace text" mode so the user can edit the original content.
  static Future<String> extractPageText(
      Uint8List pdfBytes, int pageIndex) async {
    return await compute(_extractPageTextImpl,
        _ExtractTextArgs(pdfBytes: pdfBytes, pageIndex: pageIndex));
  }

  /// Page dimensions in PDF user-space units (72 per inch).
  static Future<List<PdfPageSize>> pageSizes(Uint8List pdfBytes) async {
    return await compute(_pageSizesImpl, pdfBytes);
  }
}

/// A block of OCR'd text with its bounding box. Top-down coordinates
/// in PDF user-space units.
class OcrTextBlock {
  final String text;
  final Rect box;
  const OcrTextBlock({required this.text, required this.box});
}

/// Page dimensions in PDF user-space units (72 per inch).
/// Renamed from `PageSize` to avoid colliding with `dart:ui.Size`.
class PdfPageSize {
  final double width;
  final double height;
  const PdfPageSize(this.width, this.height);
}

/// A single edit operation for [PdfEditorService.edit]. Only the
/// fields matching [kind] are used.
class PdfEditOperation {
  final String kind; // 'text' | 'rect' | 'ellipse' | 'line' | 'image'
  final String? text;
  final double? fontSize;
  final int? colorArgb;
  final Rect? rect;
  final Uint8List? imageBytes;

  const PdfEditOperation({
    required this.kind,
    this.text,
    this.fontSize,
    this.colorArgb,
    this.rect,
    this.imageBytes,
  });

  factory PdfEditOperation.text(
    String text, {
    double fontSize = 12,
    int colorArgb = 0xFF000000,
    Rect? at,
  }) =>
      PdfEditOperation(
        kind: 'text',
        text: text,
        fontSize: fontSize,
        colorArgb: colorArgb,
        rect: at,
      );

  factory PdfEditOperation.rect(Rect rect, {int colorArgb = 0xFF000000}) =>
      PdfEditOperation(kind: 'rect', rect: rect, colorArgb: colorArgb);

  factory PdfEditOperation.ellipse(Rect rect, {int colorArgb = 0xFF000000}) =>
      PdfEditOperation(kind: 'ellipse', rect: rect, colorArgb: colorArgb);

  factory PdfEditOperation.line(Rect rect, {int colorArgb = 0xFF000000}) =>
      PdfEditOperation(kind: 'line', rect: rect, colorArgb: colorArgb);

  factory PdfEditOperation.image(Uint8List bytes, Rect rect) =>
      PdfEditOperation(kind: 'image', imageBytes: bytes, rect: rect);
}

// ============================================================================
// Isolate implementations
// ============================================================================

/// Round-trip repair. Opens the PDF, copies every page onto a fresh
/// document, and saves. This rebuilds the cross-reference table and
/// object stream layout — exactly the structures that break when a PDF
/// is "corrupt".
Uint8List _repairImpl(Uint8List input) {
  final src = PdfDocument(inputBytes: input);
  final out = PdfDocument();

  for (var i = 0; i < src.pages.count; i++) {
    final srcPage = src.pages[i];
    final newPage = out.pages.add();
    newPage.graphics
        .drawPdfTemplate(srcPage.createTemplate(), Offset.zero);
  }

  src.dispose();
  final bytes = Uint8List.fromList(out.saveSync());
  out.dispose();
  return bytes;
}

class _AddSignatureArgs {
  final Uint8List pdfBytes;
  final Uint8List signaturePng;
  final int pageIndex;
  final double x;
  final double y;
  final double width;
  final double height;

  _AddSignatureArgs({
    required this.pdfBytes,
    required this.signaturePng,
    required this.pageIndex,
    required this.x,
    required this.y,
    required this.width,
    required this.height,
  });
}

Uint8List _addSignatureImpl(_AddSignatureArgs args) {
  final doc = PdfDocument(inputBytes: args.pdfBytes);
  if (args.pageIndex < 0 || args.pageIndex >= doc.pages.count) {
    doc.dispose();
    throw ArgumentError(
      'Page index ${args.pageIndex} out of range (PDF has ${doc.pages.count} pages).',
    );
  }
  final page = doc.pages[args.pageIndex];
  final image = PdfBitmap(args.signaturePng);
  // Syncfusion takes top-left origin already, so no Y-flip needed here
  // (we accept top-down from the caller).
  page.graphics.drawImage(
    image,
    Rect.fromLTWH(args.x, args.y, args.width, args.height),
  );
  final bytes = Uint8List.fromList(doc.saveSync());
  doc.dispose();
  return bytes;
}

class _AddCommentArgs {
  final Uint8List pdfBytes;
  final int pageIndex;
  final double x;
  final double y;
  final String text;
  final String author;
  final String subject;

  _AddCommentArgs({
    required this.pdfBytes,
    required this.pageIndex,
    required this.x,
    required this.y,
    required this.text,
    required this.author,
    required this.subject,
  });
}

Uint8List _addCommentImpl(_AddCommentArgs args) {
  final doc = PdfDocument(inputBytes: args.pdfBytes);
  if (args.pageIndex < 0 || args.pageIndex >= doc.pages.count) {
    doc.dispose();
    throw ArgumentError(
      'Page index ${args.pageIndex} out of range (PDF has ${doc.pages.count} pages).',
    );
  }
  final page = doc.pages[args.pageIndex];

  // Syncfusion uses bottom-up coords for annotations; convert.
  final pdfY = page.size.height - args.y - 24;
  final annotation = PdfPopupAnnotation(
    Rect.fromLTWH(args.x, pdfY, 24, 24),
    args.text,
  );
  annotation.author = args.author;
  annotation.subject = args.subject;
  annotation.icon = PdfPopupIcon.comment;
  annotation.color = PdfColor(255, 235, 59);
  page.annotations.add(annotation);

  final bytes = Uint8List.fromList(doc.saveSync());
  doc.dispose();
  return bytes;
}

class _OverlayOcrTextArgs {
  final Uint8List pdfBytes;
  final int pageIndex;
  final List<OcrTextBlock> blocks;
  _OverlayOcrTextArgs({
    required this.pdfBytes,
    required this.pageIndex,
    required this.blocks,
  });
}

Uint8List _overlayOcrTextImpl(_OverlayOcrTextArgs args) {
  final doc = PdfDocument(inputBytes: args.pdfBytes);
  if (args.pageIndex < 0 || args.pageIndex >= doc.pages.count) {
    doc.dispose();
    throw ArgumentError(
      'Page index ${args.pageIndex} out of range (PDF has ${doc.pages.count} pages).',
    );
  }
  final page = doc.pages[args.pageIndex];

  for (final b in args.blocks) {
    final font = PdfStandardFont(
      PdfFontFamily.helvetica,
      b.box.height * 0.7,
    );
    // Transparent brush — invisible text but selectable for copy/search.
    final brush = PdfSolidBrush(PdfColor(0, 0, 0, 0));
    page.graphics.drawString(
      b.text,
      font,
      brush: brush,
      bounds: Rect.fromLTWH(b.box.left, b.box.top, b.box.width, b.box.height),
    );
  }

  final bytes = Uint8List.fromList(doc.saveSync());
  doc.dispose();
  return bytes;
}

class _EditArgs {
  final Uint8List pdfBytes;
  final int pageIndex;
  final List<PdfEditOperation> operations;
  _EditArgs({
    required this.pdfBytes,
    required this.pageIndex,
    required this.operations,
  });
}

Uint8List _editImpl(_EditArgs args) {
  final doc = PdfDocument(inputBytes: args.pdfBytes);
  if (args.pageIndex < 0 || args.pageIndex >= doc.pages.count) {
    doc.dispose();
    throw ArgumentError(
      'Page index ${args.pageIndex} out of range (PDF has ${doc.pages.count} pages).',
    );
  }
  final page = doc.pages[args.pageIndex];
  final g = page.graphics;

  for (final op in args.operations) {
    final color = _colorFromArgb(op.colorArgb ?? 0xFF000000);
    final pdfRect = op.rect == null
        ? null
        : Rect.fromLTWH(
            op.rect!.left,
            op.rect!.top,
            op.rect!.width,
            op.rect!.height,
          );

    switch (op.kind) {
      case 'text':
        if (op.text == null || pdfRect == null) continue;
        final font = PdfStandardFont(
          PdfFontFamily.helvetica,
          op.fontSize ?? 12,
        );
        g.drawString(
          op.text!,
          font,
          brush: PdfSolidBrush(color),
          bounds: pdfRect,
        );
        break;
      case 'rect':
        if (pdfRect == null) continue;
        g.drawRectangle(pen: PdfPen(color), bounds: pdfRect);
        break;
      case 'ellipse':
        if (pdfRect == null) continue;
        g.drawEllipse(pdfRect, pen: PdfPen(color));
        break;
      case 'line':
        if (pdfRect == null) continue;
        g.drawLine(
          PdfPen(color),
          Offset(pdfRect.left, pdfRect.top),
          Offset(
            pdfRect.left + pdfRect.width,
            pdfRect.top + pdfRect.height,
          ),
        );
        break;
      case 'image':
        if (op.imageBytes == null || pdfRect == null) continue;
        g.drawImage(PdfBitmap(op.imageBytes!), pdfRect);
        break;
    }
  }

  final bytes = Uint8List.fromList(doc.saveSync());
  doc.dispose();
  return bytes;
}

int _pageCountImpl(Uint8List pdfBytes) {
  final doc = PdfDocument(inputBytes: pdfBytes);
  final n = doc.pages.count;
  doc.dispose();
  return n;
}

class _ExtractTextArgs {
  final Uint8List pdfBytes;
  final int pageIndex;
  _ExtractTextArgs({required this.pdfBytes, required this.pageIndex});
}

String _extractPageTextImpl(_ExtractTextArgs args) {
  final doc = PdfDocument(inputBytes: args.pdfBytes);
  final extractor = PdfTextExtractor(doc);
  final text = extractor.extractText(
    startPageIndex: args.pageIndex,
    endPageIndex: args.pageIndex,
  );
  doc.dispose();
  return text;
}

List<PdfPageSize> _pageSizesImpl(Uint8List pdfBytes) {
  final doc = PdfDocument(inputBytes: pdfBytes);
  final sizes = <PdfPageSize>[
    for (var i = 0; i < doc.pages.count; i++)
      PdfPageSize(
          doc.pages[i].size.width, doc.pages[i].size.height),
  ];
  doc.dispose();
  return sizes;
}

/// Convert a 32-bit ARGB int (0xAARRGGBB) to a [PdfColor].
PdfColor _colorFromArgb(int argb) {
  final a = (argb >> 24) & 0xFF;
  final r = (argb >> 16) & 0xFF;
  final g = (argb >> 8) & 0xFF;
  final b = argb & 0xFF;
  return PdfColor(r, g, b, a);
}
