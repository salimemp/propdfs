#!/usr/bin/env python3
"""
Generate the four public feed / discovery files served at the root of
propdfs.com:

  - rss.xml      RSS 2.0
  - feed.xml     RSS 2.0 mirror (some readers only check this path)
  - atom.xml     Atom 1.0
  - sitemap.xml  sitemap protocol (extends the existing one with blog posts)

The tool catalog and marketing pages in sitemap.xml are still
hand-maintained (the comment at the top of the existing file says
"32 tools + 5 marketing pages; a generator script can take over once
the catalog grows past ~50 entries"). This script only ADDS the
blog post entries to sitemap.xml — it does NOT touch the tool list.
If you need to regenerate the full sitemap, edit this script and
add the tools section.

The blog posts themselves live in `backend/app/api/blog.py`
(`BLOG_POSTS` list). We don't read from Python at build time
because (a) the deploy artifact for propdfs.com is just the static
files in `frontend/web/`, and (b) it would couple a content piece
to a build-time Python eval. The list below is the source of truth
for the FEED files; keep it in sync with the backend when a post
is added or removed.
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from email.utils import format_datetime
from pathlib import Path
from xml.sax.saxutils import escape as xml_escape

SITE_URL = "https://propdfs.com"
SITE_NAME = "ProPDFs"
SITE_DESCRIPTION = (
    "32 PDF tools in one place — merge, split, compress, convert, "
    "edit, sign, OCR, and translate. Runs in your browser, "
    "end-to-end encrypted, GDPR-ready, WCAG 2.1 AA."
)
SITE_LANGUAGE = "en"
AUTHOR_NAME = "ProPDFs Editorial Team"
AUTHOR_EMAIL = "team@propdfs.com"


# ─── Posts ────────────────────────────────────────────────────────────────
# Source of truth for the feed files. Keep in sync with BLOG_POSTS in
# backend/app/api/blog.py. The fields below are exactly what we need
# for the four feed formats — no need to mirror the full backend
# schema (body, tags, etc.).
POSTS = [
    {
        "slug": "best-pdf-tools-2025-comparison",
        "title": "Best PDF Tools in 2025: A Comprehensive Comparison",
        "summary": (
            "Compare the top PDF tools of 2025 including ProPDFs, "
            "SmallPDF, ILovePDF, PDFgear, and Adobe Acrobat. "
            "Feature, pricing, and free-tier breakdown."
        ),
        "category": "comparison",
        "published_at": "2025-01-01T00:00:00Z",
        "updated_at": "2025-01-01T00:00:00Z",
    },
    {
        "slug": "how-to-compress-pdf-without-losing-quality",
        "title": "How to Compress PDFs Without Losing Quality: A Complete Guide",
        "summary": (
            "Reduce PDF file size by up to 90% without losing quality. "
            "Image optimisation, font subsetting, metadata stripping, "
            "and a tool-by-tool comparison."
        ),
        "category": "tutorial",
        "published_at": "2025-01-05T00:00:00Z",
        "updated_at": "2025-01-05T00:00:00Z",
    },
    {
        "slug": "pdf-security-best-practices-2025",
        "title": "PDF Security Best Practices in 2025: Protect Your Documents",
        "summary": (
            "Essential PDF security for 2025: AES-256 encryption, "
            "password protection, digital signatures, redaction, "
            "and compliance (HIPAA, GDPR, SOC 2, CCPA)."
        ),
        "category": "security",
        "published_at": "2025-01-10T00:00:00Z",
        "updated_at": "2025-01-10T00:00:00Z",
    },
    {
        "slug": "ai-in-document-processing-2025",
        "title": "AI in Document Processing: 2025 Trends and Transformations",
        "summary": (
            "How AI is reshaping document workflows in 2025: "
            "summarisation, translation, smart form-filling, "
            "and Gemini-powered extraction."
        ),
        "category": "technology",
        "published_at": "2025-01-15T00:00:00Z",
        "updated_at": "2025-01-15T00:00:00Z",
    },
    {
        "slug": "propdfs-vs-competitors-fact-check",
        "title": "ProPDFs vs. Competitors: Fact-Checked Feature Comparison",
        "summary": (
            "Side-by-side, fact-checked comparison of ProPDFs "
            "against the leading competitors. Pricing, free-tier "
            "limits, OCR languages, AI features, and security posture."
        ),
        "category": "comparison",
        "published_at": "2025-01-20T00:00:00Z",
        "updated_at": "2025-01-20T00:00:00Z",
    },
]


# ─── Helpers ──────────────────────────────────────────────────────────────


def parse_iso(iso: str) -> datetime:
    """Parse an ISO 8601 timestamp into a tz-aware datetime."""
    # Python 3.11+ fromisoformat handles 'Z' suffix; fall back to
    # explicit replace for older runtimes just in case.
    if iso.endswith("Z"):
        iso = iso[:-1] + "+00:00"
    return datetime.fromisoformat(iso).astimezone(timezone.utc)


def rfc822(dt: datetime) -> str:
    """Convert a datetime to RFC 822 (RSS pubDate format)."""
    return format_datetime(dt, usegmt=True)


def iso_z(dt: datetime) -> str:
    """Convert a datetime to ISO 8601 with Z suffix (Atom / sitemap)."""
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")


def iso_date(dt: datetime) -> str:
    """Convert a datetime to ISO 8601 date (sitemap lastmod)."""
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%d")


def post_url(slug: str) -> str:
    return f"{SITE_URL}/blog/{slug}"


# ─── Generators ───────────────────────────────────────────────────────────


def render_rss(posts: list[dict]) -> str:
    """RSS 2.0 with an Atom self-link (recommended for proper discovery)."""
    last_build = max(parse_iso(p["updated_at"]) for p in posts)
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" '
        'xmlns:atom="http://www.w3.org/2005/Atom" '
        'xmlns:content="http://purl.org/rss/1.0/modules/content/">',
        "  <channel>",
        f"    <title>{xml_escape(SITE_NAME)} — Blog</title>",
        f"    <link>{SITE_URL}/blog</link>",
        f'    <atom:link href="{SITE_URL}/rss.xml" rel="self" '
        f'type="application/rss+xml" />',
        f"    <description>{xml_escape(SITE_DESCRIPTION)}</description>",
        f"    <language>{SITE_LANGUAGE}</language>",
        f"    <lastBuildDate>{rfc822(last_build)}</lastBuildDate>",
        f"    <managingEditor>{xml_escape(AUTHOR_EMAIL)} "
        f"({xml_escape(AUTHOR_NAME)})</managingEditor>",
        f"    <webMaster>{xml_escape(AUTHOR_EMAIL)} "
        f"({xml_escape(AUTHOR_NAME)})</webMaster>",
        "",
    ]
    for p in posts:
        pub = parse_iso(p["published_at"])
        url = post_url(p["slug"])
        lines += [
            "    <item>",
            f"      <title>{xml_escape(p['title'])}</title>",
            f"      <link>{url}</link>",
            f'      <guid isPermaLink="true">{url}</guid>',
            f"      <pubDate>{rfc822(pub)}</pubDate>",
            f"      <author>{xml_escape(AUTHOR_EMAIL)} "
            f"({xml_escape(AUTHOR_NAME)})</author>",
            f"      <category>{xml_escape(p['category'])}</category>",
            f"      <description><![CDATA[{p['summary']}]]></description>",
            "    </item>",
            "",
        ]
    lines += ["  </channel>", "</rss>", ""]
    return "\n".join(lines)


def render_atom(posts: list[dict]) -> str:
    """Atom 1.0 (RFC 4287)."""
    updated = max(parse_iso(p["updated_at"]) for p in posts)
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<feed xmlns="http://www.w3.org/2005/Atom">',
        f"  <id>{SITE_URL}/blog</id>",
        f"  <title>{xml_escape(SITE_NAME)} — Blog</title>",
        f"  <subtitle>{xml_escape(SITE_DESCRIPTION)}</subtitle>",
        f"  <updated>{iso_z(updated)}</updated>",
        f'  <link href="{SITE_URL}/blog" rel="alternate" />',
        f'  <link href="{SITE_URL}/atom.xml" rel="self" '
        f'type="application/atom+xml" />',
        "  <rights>Copyright © 2025 ProPDFs. All rights reserved.</rights>",
        "  <author>",
        f"    <name>{xml_escape(AUTHOR_NAME)}</name>",
        f"    <email>{xml_escape(AUTHOR_EMAIL)}</email>",
        "  </author>",
        "",
    ]
    for p in posts:
        pub = parse_iso(p["published_at"])
        upd = parse_iso(p["updated_at"])
        url = post_url(p["slug"])
        lines += [
            "  <entry>",
            f"    <id>{url}</id>",
            f"    <title>{xml_escape(p['title'])}</title>",
            f"    <updated>{iso_z(upd)}</updated>",
            f"    <published>{iso_z(pub)}</published>",
            f'    <link href="{url}" rel="alternate" />',
            f"    <summary type=\"text\"><![CDATA[{p['summary']}]]></summary>",
            f"    <category term=\"{xml_escape(p['category'])}\" />",
            "  </entry>",
            "",
        ]
    lines += ["</feed>", ""]
    return "\n".join(lines)


def render_sitemap_blog_entries(posts: list[dict]) -> str:
    """Just the blog-post <url> entries (the rest of sitemap.xml is
    hand-maintained and lives at frontend/web/sitemap.xml)."""
    lines = [
        "  <!-- ===== Blog posts (auto-generated by scripts/build_feeds.py) ===== -->"
    ]
    for p in posts:
        upd = parse_iso(p["updated_at"])
        lines += [
            "  <url>",
            f"    <loc>{post_url(p['slug'])}</loc>",
            f"    <lastmod>{iso_date(upd)}</lastmod>",
            "    <changefreq>monthly</changefreq>",
            "    <priority>0.7</priority>",
            "  </url>",
        ]
    lines.append("</urlset>")
    return "\n".join(lines) + "\n"


# ─── Main ─────────────────────────────────────────────────────────────────


def main() -> int:
    out_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("frontend/web")
    out_dir.mkdir(parents=True, exist_ok=True)

    rss = render_rss(POSTS)
    (out_dir / "rss.xml").write_text(rss, encoding="utf-8")
    print(f"  wrote {out_dir / 'rss.xml'}  ({len(rss):,} bytes)")

    # feed.xml is an RSS 2.0 mirror. Some feed readers and validators
    # default to /feed.xml, so we ship a byte-identical copy.
    (out_dir / "feed.xml").write_text(rss, encoding="utf-8")
    print(f"  wrote {out_dir / 'feed.xml'}  (mirror of rss.xml)")

    atom = render_atom(POSTS)
    (out_dir / "atom.xml").write_text(atom, encoding="utf-8")
    print(f"  wrote {out_dir / 'atom.xml'}  ({len(atom):,} bytes)")

    # For sitemap.xml we DON'T overwrite the hand-maintained file
    # (it lists 32 tools + marketing pages). We just emit the blog
    # post entries to stdout so the operator can paste them in, OR
    # merge automatically if the env var is set.
    blog_entries = render_sitemap_blog_entries(POSTS)
    if os.environ.get("MERGE_SITEMAP") == "1":
        sitemap_path = out_dir / "sitemap.xml"
        existing = sitemap_path.read_text(encoding="utf-8")
        if "</urlset>" in existing:
            merged = existing.replace("</urlset>", blog_entries, 1)
        else:
            merged = existing + "\n" + blog_entries
        sitemap_path.write_text(merged, encoding="utf-8")
        print(f"  merged blog entries into {sitemap_path}")
    else:
        print("")
        print("  Blog-post entries for sitemap.xml (paste before </urlset>):")
        print("  " + "-" * 60)
        print(blog_entries)

    return 0


if __name__ == "__main__":
    sys.exit(main())
