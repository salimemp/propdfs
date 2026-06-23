/// Frontend fallback for the blog API. The full blog catalog lives in
/// `backend/app/api/blog.py` (BLOG_POSTS). When the backend isn't
/// reachable (e.g. local dev without the API server running, or the
/// `api.propdfs.com` DNS record isn't pointed at Railway yet), we show
/// this small seed so the blog page never looks empty.
///
/// Keep this list SHORT — the API is the source of truth. When the API
/// is up, its posts fully replace this seed. The seed is only a
/// graceful-degradation path so the blog page never shows a "coming
/// soon" placeholder in production.
///
/// Schema matches the JSON shape returned by `/api/v1/blog/posts`:
///   id, slug, title, meta_description, keywords, author, published_at,
///   updated_at, category, tags, reading_time, featured_image, content
// Not `const` because the map values include raw strings that would
// require every triple-quoted multi-line string to be const too.
// This list is loaded once at startup — runtime perf is identical.
final List<Map<String, dynamic>> kBlogSeedPosts = [
  {
    'id': 'seed-1',
    'slug': 'welcome-to-propdfs',
    'title': 'Welcome to ProPDFs: 32 PDF tools, one place',
    'meta_description':
        'A quick tour of ProPDFs — every tool we ship today, why we built it, '
        "and what's coming next.",
    'keywords': <String>['propdfs', 'pdf tools', 'introduction'],
    'author': 'ProPDFs Editorial Team',
    'published_at': '2025-01-01T00:00:00Z',
    'updated_at': '2025-01-01T00:00:00Z',
    'category': 'announcements',
    'tags': <String>['propdfs', 'introduction', 'launch'],
    'reading_time': 4,
    'featured_image': '',
    'content': """# Welcome to ProPDFs

ProPDFs is **32 PDF tools in one place** — merge, split, compress, convert, edit, sign, and translate PDFs without ever installing software.

## What's in this release

Everything you need to work with PDFs every day:

- **Organize** — merge, split, extract, remove pages, reorder pages
- **Optimize** — compress, repair, OCR
- **Convert** — Word / Excel / PowerPoint / JPG / HTML to PDF, and back
- **Edit** — text, shapes, highlights, page numbers, watermarks
- **Security** — protect, unlock, redact, archive-grade PDF/A
- **AI** — summarize, translate, chat with PDF, fill forms, extract data

## Why we built this

iLovePDF and SmallPDF are great but they cap free users at 2–3 tasks per day and lock the rest behind a \$9–\$12/month paywall. ProPDFs gives you 5 free tasks per day, no signup required, and runs everything through an encrypted pipeline so your documents never sit on a server you don't control.

## What's next

We're shipping native iOS and Android apps next quarter, plus real-time collaboration on shared documents. If you want early access, join the Beta Program from the home page.

Welcome aboard."""
  },
  {
    'id': 'seed-2',
    'slug': 'pdf-merge-best-practices',
    'title': 'How to merge PDFs the right way (and the wrong way)',
    'meta_description':
        'Most PDF merges silently lose bookmarks, form fields, or page labels. '
        "Here's how to keep them.",
    'keywords': <String>['merge', 'pdf', 'tutorial'],
    'author': 'Sarah Mitchell, Document Specialist',
    'published_at': '2025-01-08T00:00:00Z',
    'updated_at': '2025-01-08T00:00:00Z',
    'category': 'tutorial',
    'tags': <String>['pdf', 'merge', 'tutorial', 'best-practices'],
    'reading_time': 5,
    'featured_image': '',
    'content': '''# How to merge PDFs the right way (and the wrong way)

Merging PDFs sounds simple: combine 5 files, get 1 file. But the **wrong** way silently drops things — bookmarks, form fields, page labels, accessibility tags — and your "merged" file is barely usable.

## The wrong way

- Pasting screenshots into a Word doc and exporting to PDF (loses everything)
- Using a website that re-encodes every page as an image (huge file, no text search)
- Merging then discovering all your clickable TOC links are gone

## The right way

A real PDF merge:

1. **Reads the structure** of each input file (the PDF "object tree", not just the pages)
2. **Copies the pages** into a new container PDF
3. **Preserves form fields, links, bookmarks, and accessibility tags** so the result is a usable document, not just a stack of pages

ProPDFs uses this approach — your merged file keeps its internal structure, including form fields, clickable links, and the document outline.

## Quick tips

- **Order matters** — pages keep their source order. Use our **Organize PDF** tool if you want to shuffle.
- **Mixed sizes** — merging Letter and A4 pages is fine; the output keeps the original page sizes.
- **Bookmarks** — ProPDFs merges the source bookmarks automatically. If you want a custom table of contents, edit the merged file with **Edit PDF**.

Try the Merge tool now →'''
  },
  {
    'id': 'seed-3',
    'slug': 'ocr-scanned-pdfs',
    'title': 'What is OCR and why your scanned PDFs need it',
    'meta_description':
        'Scanned PDFs are pictures, not text. OCR turns them into searchable, '
        "copyable, accessible documents. Here's how it works.",
    'keywords': <String>['ocr', 'scanned', 'pdf', 'accessibility'],
    'author': 'Daniel Okafor, ML Engineer',
    'published_at': '2025-01-12T00:00:00Z',
    'updated_at': '2025-01-12T00:00:00Z',
    'category': 'guide',
    'tags': <String>['ocr', 'scanned', 'accessibility', 'ml'],
    'reading_time': 6,
    'featured_image': '',
    'content': """# What is OCR and why your scanned PDFs need it

A scanned PDF is **not a text document** — it's a stack of images that happen to be inside a `.pdf` wrapper. Try selecting text from one: you'll copy a blank string. Try Ctrl+F to search: nothing found. Try a screen reader: silence.

**OCR** (Optical Character Recognition) is the missing layer. It looks at every image on every page, recognises the letters, and writes an invisible text layer on top. After OCR:

- You can **select text** and copy it
- **Ctrl+F** finds words across the entire document
- **Screen readers** speak the content (massive accessibility win)
- **Search engines** can index the content (SEO for public docs)

## How it works in ProPDFs

1. You upload a scanned PDF
2. We render each page to a high-DPI image
3. We run **Tesseract** (the open-source OCR engine) on each page, with language packs for 30+ languages
4. We write the recognised text back into the PDF as an **invisible text layer** — your scan looks identical, but the text is now machine-readable
5. You download the searchable PDF

## When you do (and don't) need it

| Use case | Need OCR? |
|---|---|
| Scanned document (image only) | Yes — text is currently unsearchable |
| Document with selectable text already | No — text is already there |
| Form with hand-written entries | Partial — typed text is recognised, handwriting is not |
| Photo of a document taken on a phone | Yes — same as a scan |

ProPDFs runs OCR entirely in your browser via Tesseract.js — your document never leaves your device.

Try the OCR tool →"""
  },
];

/// Categories seeded alongside the posts. Matches the response shape of
/// `/api/v1/blog/categories` (name + count).
final List<Map<String, dynamic>> kBlogSeedCategories = [
  <String, dynamic>{'name': 'announcements', 'count': 1},
  <String, dynamic>{'name': 'tutorial', 'count': 1},
  <String, dynamic>{'name': 'guide', 'count': 1},
  <String, dynamic>{'name': 'comparison', 'count': 0},
  <String, dynamic>{'name': 'release-notes', 'count': 0},
];
