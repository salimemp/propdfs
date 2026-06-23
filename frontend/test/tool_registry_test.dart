// Tests for the per-tool routing fix.
//
// Background: before this fix, every home-screen card routed to either
// `/tools?tool=merge` or `/tools?tool=convert`. Because PdfToolsScreen
// had a hardcoded 7-tool list with `merge` as the default fallback,
// every Edit / Security / AI card ended up on the Merge page, and every
// Convert card ended up on the Convert-to-Image page. This file pins
// the fix in place: every tool gets its own URL slug, the slug is
// unique, and the router resolves it to the right page type.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:propdfs/core/tools/tool_registry.dart';
import 'package:propdfs/presentation/screens/tools/tool_page.dart';
import 'package:propdfs/presentation/screens/tools/coming_soon_tool_page.dart';
import 'package:propdfs/presentation/screens/tools/repair_pdf_page.dart';
import 'package:propdfs/presentation/screens/tools/ocr_pdf_page.dart';
import 'package:propdfs/presentation/screens/tools/esign_pdf_page.dart';
import 'package:propdfs/presentation/screens/tools/comment_pdf_page.dart';
import 'package:propdfs/presentation/screens/tools/edit_pdf_page.dart';
import 'package:propdfs/presentation/screens/pdf_tools_screen.dart';

void main() {
  group('ToolRegistry — uniqueness', () {
    test('every tool has a unique id', () {
      final ids = ToolRegistry.all.map((t) => t.id).toList();
      expect(ids.toSet().length, ids.length,
          reason: 'Duplicate tool ids would collapse routes to the same URL.');
    });

    test('every tool has a unique title', () {
      final titles = ToolRegistry.all.map((t) => t.title).toList();
      // Titles SHOULD be unique too — if two tools share a title the home
      // grid will look like it has duplicate cards.
      expect(titles.toSet().length, titles.length,
          reason: 'Two tools with the same title on the home grid looks broken.');
    });

    test('catalog count matches home grid count', () {
      // We don't hardcode 35 — the registry IS the source of truth, the
      // home grid and catalog header both render `ToolRegistry.all.length`.
      // Pin it to >= 30 so we notice if a future change accidentally
      // drops half the catalog.
      expect(ToolRegistry.all.length, greaterThanOrEqualTo(30));
    });

    test('ToolRegistry.findById round-trips every tool', () {
      for (final t in ToolRegistry.all) {
        expect(ToolRegistry.findById(t.id), isNotNull,
            reason: 'Lookup must succeed for ${t.id}');
        expect(ToolRegistry.findById(t.id)!.title, t.title);
      }
    });

    test('ToolRegistry.findById returns null for unknown slugs', () {
      expect(ToolRegistry.findById('does-not-exist'), isNull);
    });
  });

  group('ToolRegistry — slug assignments (regression: no Merge fallback)', () {
    test('every Edit card has a unique non-merge slug', () {
      // Before the fix: Edit, Crop, Sign, Compare, Page numbers all routed
      // to /tools?tool=merge. Now each must have its own slug.
      final editIds = ToolRegistry.byCategory('Edit').map((t) => t.id).toList();
      expect(editIds.toSet().length, editIds.length,
          reason: 'Edit cards must each have a unique slug');
      // None of them should be 'merge' anymore.
      expect(editIds, isNot(contains('merge')));
    });

    test('every Security card has a unique non-merge slug', () {
      final ids = ToolRegistry.byCategory('Security').map((t) => t.id).toList();
      expect(ids.toSet().length, ids.length);
      expect(ids, isNot(contains('merge')));
    });

    test('every AI card has a unique non-merge slug', () {
      final ids = ToolRegistry.byCategory('AI').map((t) => t.id).toList();
      expect(ids.toSet().length, ids.length);
      expect(ids, isNot(contains('merge')));
    });

    test('Repair PDF and OCR PDF each have their own slug (not merge)', () {
      // The user's bug report called these out by name.
      final repair = ToolRegistry.findById('repair');
      final ocr = ToolRegistry.findById('ocr');
      expect(repair, isNotNull, reason: 'Repair PDF needs its own slug');
      expect(ocr, isNotNull, reason: 'OCR PDF needs its own slug');
      expect(repair!.id, 'repair');
      expect(ocr!.id, 'ocr');
    });

    test('every Convert-to card has a unique slug (not all "convert")', () {
      // Before the fix: Word/Excel/PPT/JPG/HTML all routed to convert.
      final ids = ToolRegistry.byCategory('Convert')
          .map((t) => t.id)
          .toList();
      expect(ids.toSet().length, ids.length,
          reason: 'Convert cards must each have a unique slug');
      // The old behavior crammed everything into 'convert'. Make sure
      // there are multiple distinct slugs now.
      expect(ids.toSet().length, greaterThan(3));
    });
  });

  group('ToolRegistry — implementation status', () {
    test('implemented tools either have a taskType or are frontend-only', () {
      // Two valid shapes for an implemented tool:
      //   - Backend-backed: taskType is set → uploades + posts to /process/
      //   - Frontend-only: taskType is null → uses a dedicated page that
      //     does the work via PdfEditorService in the browser (Repair,
      //     OCR, eSign, Comment, Edit).
      // Either is fine — what matters is that the tool actually works.
      for (final t in ToolRegistry.all) {
        if (t.status == ToolStatus.implemented) {
          final hasBackend = t.taskType != null;
          // Frontend-only tools all live in lib/presentation/screens/tools/
          // and are wired in app_router.dart's switch on toolId. The
          // easiest way to verify from a test is the taskType check.
          if (!hasBackend) {
            // Allow these known frontend-only tools; reject silent ones.
            const frontendOnly = {
              'repair', 'ocr', 'sign', 'comment', 'edit',
            };
            expect(frontendOnly.contains(t.id), isTrue,
                reason: '${t.id} is implemented with no taskType but is '
                    'not in the frontend-only allowlist. Either add a '
                    'backend task_type or add it to the frontend-only set.');
          }
        }
      }
    });

    test('coming-soon tools have a distinct title and description', () {
      // Coming-soon pages should be tailored per tool, not a generic stub.
      for (final t in ToolRegistry.all) {
        if (t.status == ToolStatus.comingSoon) {
          expect(t.title, isNotEmpty);
          expect(t.description, isNotEmpty);
          // longDescription drives the placeholder copy — must be set.
          expect(t.longDescription, isNotNull,
              reason: '${t.id} is coming-soon but has no longDescription');
        }
      }
    });

    test('implemented tools match a known backend task_type', () {
      // Keep this list in sync with backend/app/services/celery_tasks.py
      const known = {
        'merge',
        'split',
        'compress',
        'rotate',
        'extract',
        'watermark',
        'convert_to_images',
        'images_to_pdf',
      };
      for (final t in ToolRegistry.all) {
        if (t.taskType != null) {
          expect(known.contains(t.taskType), isTrue,
              reason: '${t.id} declares unknown taskType "${t.taskType}". '
                  'Add it to celery_tasks.py or mark as comingSoon.');
        }
      }
    });
  });

  group('Routing — /tools/:toolId resolves to the right page', () {
    // Build a minimal GoRouter with only the /tools routes so we don't
    // need to wire the full app router (which depends on auth providers).
    late GoRouter router;

    setUp(() {
      router = GoRouter(
        initialLocation: '/tools',
        routes: [
          GoRoute(
            path: '/tools',
            builder: (_, __) => const PdfToolsScreen(),
          ),
          GoRoute(
            path: '/tools/:toolId',
            builder: (context, state) {
              // Mirror the production router's switch for frontend-only
              // tools so the test sees the same page widget the real
              // app would.
              final toolId = state.pathParameters['toolId']!;
              switch (toolId) {
                case 'repair':
                  return const RepairPdfPage();
                case 'ocr':
                  return const OcrPdfPage();
                case 'sign':
                  return const EsignPdfPage();
                case 'comment':
                  return const CommentPdfPage();
                case 'edit':
                  return const EditPdfPage();
              }
              final tool = ToolRegistry.findById(toolId);
              if (tool == null) return const PdfToolsScreen();
              return tool.status == ToolStatus.implemented
                  ? ToolPage(tool: tool)
                  : ComingSoonToolPage(tool: tool);
            },
          ),
        ],
      );
    });

    Future<void> pump(WidgetTester tester, String location) async {
      // Resize so pages with multi-column layouts don't overflow at the
      // default 800x600 viewport.
      tester.view.physicalSize = const Size(1600, 1200);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp.router(
            routerConfig: router,
          ),
        ),
      );
      router.go(location);
      await tester.pumpAndSettle();
    }

    testWidgets('Repair PDF lands on RepairPdfPage, not Merge',
        (tester) async {
      await pump(tester, '/tools/repair');

      // App bar shows the tool's real title.
      expect(find.text('Repair PDF'), findsWidgets);
      // RepairPdfPage has the privacy banner.
      expect(find.textContaining('100% private'), findsOneWidget);
      // And critically: NOT the merge UI.
      expect(find.text('Merge PDFs'), findsNothing);
      expect(find.text('Combine multiple PDFs into one file.'), findsNothing);
    });

    testWidgets('OCR PDF lands on OcrPdfPage', (tester) async {
      await pump(tester, '/tools/ocr');
      expect(find.text('OCR PDF'), findsWidgets);
      expect(find.textContaining('Tesseract'), findsOneWidget);
    });

    testWidgets('PDF to Word lands on ComingSoonToolPage, not Convert',
        (tester) async {
      await pump(tester, '/tools/pdf-to-word');
      expect(find.text('PDF to Word'), findsWidgets);
      // Old behavior: this card was routed to "Convert to Image".
      expect(find.text('Convert to Image'), findsNothing);
    });

    testWidgets('Merge PDF lands on the working ToolPage', (tester) async {
      await pump(tester, '/tools/merge');
      // ToolPage shows the tool title in the app bar AND in the header
      // banner — both renders are correct. Use findsWidgets for the title.
      expect(find.text('Merge PDF'), findsWidgets);
      // The "Tap to upload files" copy is on ToolPage, not ComingSoon.
      expect(find.text('Tap to upload files'), findsOneWidget);
      // Not the coming-soon page.
      expect(find.text('Coming soon'), findsNothing);
    });

    testWidgets('Compress PDF lands on the working ToolPage', (tester) async {
      await pump(tester, '/tools/compress');
      expect(find.text('Compress PDF'), findsWidgets);
      expect(find.text('Tap to upload files'), findsOneWidget);
      expect(find.text('Coming soon'), findsNothing);
    });

    testWidgets('Unknown slug falls back to the catalog, not 404',
        (tester) async {
      await pump(tester, '/tools/this-does-not-exist');
      // We bounce to the catalog page (PdfToolsScreen shows the title
      // "Browse all tools" + "All N tools" in the header). N is dynamic
      // (ToolRegistry.all.length) so just assert on the static title.
      expect(find.text('Browse all tools'), findsOneWidget);
    });

    testWidgets('Edit PDF lands on EditPdfPage (regression: was Merge)',
        (tester) async {
      await pump(tester, '/tools/edit');
      expect(find.text('Edit PDF'), findsWidgets);
      // EditPdfPage has a "minimal MVP" banner and tool chips, not
      // "Coming soon".
      expect(find.text('Coming soon'), findsNothing);
      expect(find.text('Merge PDFs'), findsNothing);
    });

    testWidgets('Protect PDF lands on its own page (regression: was Merge)',
        (tester) async {
      await pump(tester, '/tools/protect');
      expect(find.text('Protect PDF'), findsWidgets);
      expect(find.text('Coming soon'), findsOneWidget);
      expect(find.text('Merge PDFs'), findsNothing);
    });

    testWidgets('AI Summarize lands on its own page (regression: was Merge)',
        (tester) async {
      await pump(tester, '/tools/ai-summarize');
      expect(find.text('AI Summarize'), findsWidgets);
      expect(find.text('Coming soon'), findsOneWidget);
      expect(find.text('Merge PDFs'), findsNothing);
    });

    testWidgets('eSign PDF lands on EsignPdfPage', (tester) async {
      await pump(tester, '/tools/sign');
      // Title is always shown. The signature pad only renders after a
      // PDF is picked, so we don't assert on it here — the routing is
      // what we're verifying.
      expect(find.text('eSign PDF'), findsWidgets);
      expect(find.text('Coming soon'), findsNothing);
    });

    testWidgets('Comment PDF lands on CommentPdfPage', (tester) async {
      await pump(tester, '/tools/comment');
      expect(find.text('Comment PDF'), findsWidgets);
      // The intro banner is always shown — the canvas only appears after
      // a PDF is picked.
      expect(find.textContaining('Tap anywhere'), findsOneWidget);
      expect(find.text('Coming soon'), findsNothing);
    });
  });
}
