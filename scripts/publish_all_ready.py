#!/usr/bin/env python3
"""
Publish all `ready` articles from harborseo to the ProPDFs blog.

Workflow:
  1. List articles from harborseo, filter to status="completed".
  2. Group by topic (using a title-prefix key) and pick the
     highest-word-count version of each group — this dedupes
     the dozens of "Merge PDF" articles that accumulated
     during the API-shape debugging.
  3. Skip articles whose title clearly belongs to a different
     site (e.g. the "Mental Health" article is from a moodmash
     campaign — its topic doesn't overlap with propdfs.com's
     blog queue).
  4. For each survivor, POST to /blog/posts on the ProPDFs
     backend. Slug 409 means already published (skip, not
     error). Per-article error handling so one failure doesn't
     abort the batch.

Usage:
    export HARBORSEO_API_KEY="hrb_live_..."
    export PROPDFS_API="https://backend-production-fd1c0.up.railway.app/api/v1"
    export PROPDFS_ADMIN_TOKEN="eyJ..."   # the refresh token from the
                                          # admin-bootstrap workflow
    python scripts/publish_all_ready.py

Idempotent — re-runs only post the articles not yet on the
backend. The state is the ProPDFs /blog/posts endpoint (slug
uniqueness is the dedup key).
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import defaultdict
from pathlib import Path

# Allow running as a script.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts.harborseo import (  # noqa: E402
    BlogPost,
    HarborSeoClient,
    PROPDFS_ADMIN_TOKEN,
    PROPDFS_API,
)

import httpx  # noqa: E402


def list_ready(client: HarborSeoClient, site_id: str | None) -> list[dict]:
    """List ready (completed) articles, optionally filtered by
    site. We do NOT use the `?type=article` filter because some
    campaigns use other types; we filter by site_id in Python so
    we can also include all article types for that site.
    """
    items = client.list_articles(site_id=site_id)
    return [a for a in items if (a.get("status") or "").lower() == "completed"]


def group_key(article: dict) -> str:
    """A normalised topic key used to collapse near-duplicate
    articles.

    Strategy: extract the "topic noun phrase" from the title —
    a 2-word phrase that captures what the article is about,
    not how it's framed. Articles framed as "Best PDF Merge
    Tools in 2026", "How to Merge PDF Files", "PDF Merge Made
    Simple", and "The Best PDF Merge Tools: A Review" all
    collapse to the same `pdf merge` key.

    Implementation: if "pdf" appears in the title, anchor the
    key to "pdf <adjacent-verb>". Most propdfs articles follow
    this pattern: "merge pdf", "pdf merge", "compress pdf",
    "ocr pdf", "pdf vs word", "sign pdf", etc. If "pdf" is not
    in the title, fall back to the first 2 significant words.
    """
    title = (article.get("title") or "").lower()
    words = re.findall(r"[a-z0-9]+", title)
    stops = {
        "the",
        "a",
        "an",
        "in",
        "on",
        "of",
        "for",
        "to",
        "and",
        "or",
        "with",
        "your",
        "is",
        "are",
        "this",
        "that",
        "how",
        "why",
        "what",
        "when",
        "where",
        "which",
        "best",
        "top",
        "guide",
        "review",
        "complete",
        "ultimate",
        "you",
        "we",
        "use",
    }
    sig = [w for w in words if w not in stops]
    if not sig:
        return title[:40]

    # Anchor the key to a window around the most action-y word in
    # the title. For propdfs articles the action word is almost
    # always adjacent to "pdf": "merge pdf", "pdf merge",
    # "compress pdf", "ocr pdf", "sign pdf", "pdf vs word", etc.
    # We collect every word within 2 positions of "pdf" and
    # pick the first non-stop one — that captures the topic
    # verb regardless of which side of "pdf" it sits on.
    ACTION_WORDS = {
        "merge",
        "split",
        "compress",
        "convert",
        "sign",
        "edit",
        "ocr",
        "rotate",
        "unlock",
        "protect",
        "redact",
        "extract",
        "remove",
        "organize",
        "compare",
        "translate",
        "summarize",
        "fill",
        "crop",
        "watermark",
        "combine",
        "join",
        "shrink",
        "reduce",
        "read",
        "scan",
        "export",
        "import",
        "open",
    }
    if "pdf" in sig:
        i = sig.index("pdf")
        window = sig[max(0, i - 2) : i + 3]
        for w in window:
            if w in ACTION_WORDS:
                # Normalise: always "<action> pdf" so "compress
                # pdf" and "pdf compress" collapse together.
                return f"{w} pdf"
        # No action word nearby. Pair "pdf" with the nearest
        # non-stop word. For "PDF vs Word" that's "pdf vs",
        # which groups with any other "pdf vs ..." article.
        for j in (i - 1, i + 1):
            if 0 <= j < len(sig) and sig[j] not in stops:
                return f"pdf {sig[j]}"
        return "pdf"

    # Fallback: first 2 significant words
    return " ".join(sig[:2])


def belongs_to_propdfs(article: dict) -> bool:
    """Heuristic: skip articles that look like they belong to
    a different campaign. HarborSEO doesn't expose the site
    a completed article belongs to, so we filter by checking
    the title for words that don't match propdfs.com's blog
    domain. The list of blocklist keywords is intentionally
    narrow — add more if you create campaigns on other
    domains (e.g. "moodmash", "creatorsos", etc.)."""
    title = (article.get("title") or "").lower()
    blocklist = [
        "mental health",
        "moodmash",
        "tiktok",
        "creatorsos",
        "creator os",
    ]
    return not any(b in title for b in blocklist)


def pick_best_per_group(articles: list[dict]) -> list[dict]:
    """For each group_key, keep the article with the highest
    word_count (longer = more thorough). Returns the survivors
    in the order they were created (oldest first), so the
    publish output is deterministic."""
    groups: dict[str, list[dict]] = defaultdict(list)
    for a in articles:
        groups[group_key(a)].append(a)

    survivors: list[dict] = []
    for key, group in groups.items():
        group_sorted = sorted(
            group,
            key=lambda a: (a.get("word_count") or 0, a.get("created_at") or 0),
            reverse=True,
        )
        survivors.append(group_sorted[0])
    survivors.sort(key=lambda a: a.get("created_at") or 0)
    return survivors


def to_blogpost(article: dict, client: HarborSeoClient) -> BlogPost:
    """Use the client's existing mapper so we get the same
    HTML→Markdown + meta_description fallback as the topic
    queue path. The 'topic' / 'keywords' / 'category' args
    are only used as fallbacks if the article body is empty,
    which it shouldn't be at this point."""
    return client._article_to_blogpost(
        article,
        topic=article.get("title", "untitled"),
        keywords=[],
        category="tutorial",
        target_words=article.get("word_count", 1500),
    )


def publish(post: BlogPost, access_token: str) -> tuple[bool, str]:
    with httpx.Client(timeout=30.0) as c:
        r = c.post(
            f"{PROPDFS_API}/blog/posts",
            json=post.to_dict(),
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
        )
        if r.status_code == 401:
            return False, "401 — access token rejected (rotate PROPDFS_ADMIN_TOKEN)"
        if r.status_code == 403:
            return False, "403 — user is not admin (re-run create_admin.py)"
        if r.status_code == 409:
            return "skipped", f"already live: {post.slug}"
        r.raise_for_status()
        slug = r.json().get("slug", post.slug)
        return True, f"published: https://propdfs.com/blog/{slug}"


def fresh_access_token() -> tuple[str | None, str]:
    if not PROPDFS_ADMIN_TOKEN:
        return None, "PROPDFS_ADMIN_TOKEN not set"
    with httpx.Client(timeout=15.0) as c:
        try:
            r = c.post(
                f"{PROPDFS_API}/auth/refresh",
                json={"refresh_token": PROPDFS_ADMIN_TOKEN, "rotate": False},
            )
            r.raise_for_status()
            return r.json().get("access_token"), ""
        except httpx.HTTPStatusError as e:
            return None, f"refresh failed: {e.response.status_code} {e.response.text}"
        except Exception as e:
            return None, f"refresh failed: {e}"


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument(
        "--site-id",
        help="harborseo site id (default: auto-discover propdfs.com)",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be published without POSTing to the backend",
    )
    args = p.parse_args()

    client = HarborSeoClient()
    if not client.online:
        print("✗ HARBORSEO_API_KEY not set", file=sys.stderr)
        return 2

    site_id = args.site_id
    if not site_id:
        try:
            site = client.find_site("propdfs.com")
        except Exception as e:
            print(f"✗ site lookup failed: {e}", file=sys.stderr)
            return 1
        if not site:
            print("✗ propdfs.com not registered in harborseo", file=sys.stderr)
            print("  run scripts/setup_harborseo.py first", file=sys.stderr)
            return 1
        site_id = site.id
    print(f"→ Using harborseo site_id: {site_id}")

    print("→ Listing ready articles from harborseo …")
    try:
        ready = list_ready(client, site_id)
    except Exception as e:
        print(f"✗ list failed: {e}", file=sys.stderr)
        return 1
    print(f"  {len(ready)} article(s) in status=completed")

    # Filter + dedupe
    propdfs_only = [a for a in ready if belongs_to_propdfs(a)]
    skipped_other = len(ready) - len(propdfs_only)
    print(f"  {skipped_other} article(s) filtered out (different campaign)")

    survivors = pick_best_per_group(propdfs_only)
    print(f"  {len(survivors)} unique topic(s) after dedup")

    if not survivors:
        print("Nothing to publish.")
        return 0

    print("\n→ Articles to publish (oldest first):")
    for i, a in enumerate(survivors, 1):
        print(f"  {i:2d}. {a.get('word_count', 0):5d}w  " f"{a.get('title', '?')[:60]}")

    if args.dry_run:
        print("\n(dry run — no POSTs made)")
        return 0

    print("\n→ Exchanging refresh token for fresh access token …")
    access_token, err = fresh_access_token()
    if not access_token:
        print(f"✗ {err}", file=sys.stderr)
        return 1
    print("  ✓ fresh access token minted")

    counts = {"published": 0, "skipped": 0, "failed": 0}
    for article in survivors:
        title = (article.get("title") or "?")[:60]
        word_count = article.get("word_count", 0)
        try:
            post = to_blogpost(article, client)
            ok, msg = publish(post, access_token)
        except httpx.HTTPStatusError as e:
            print(f"  ✗ {title}  →  {e.response.status_code}: {e.response.text[:200]}")
            counts["failed"] += 1
            continue
        except Exception as e:
            print(f"  ✗ {title}  →  {e}")
            counts["failed"] += 1
            continue

        status = (
            "published" if ok is True else ("skipped" if ok == "skipped" else "failed")
        )
        marker = "✓" if status == "published" else ("~" if status == "skipped" else "✗")
        print(f"  {marker} {title}  ({word_count}w)  →  {msg}")
        counts[status] += 1

    print(
        f"\nDone. Published: {counts['published']}, "
        f"skipped: {counts['skipped']}, failed: {counts['failed']}."
    )
    return 0 if counts["failed"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
