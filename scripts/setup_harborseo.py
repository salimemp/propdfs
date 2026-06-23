#!/usr/bin/env python3
"""
One-time setup helper for the harborseo integration.

What it does:
  1. Verifies the HARBORSEO_API_KEY works (calls /v1/account).
  2. Lists existing sites.
  3. If propdfs.com is not registered, registers it with a default
     brand config.
  4. Prints the site_id so it can be saved (or just lets the
     publish script pick it up via the on-disk cache).

Usage:
    export HARBORSEO_API_KEY="hrb_live_..."
    python scripts/setup_harborseo.py

The script is idempotent — running it twice with the same key is
safe. The site lookup is by domain, so a second run will find the
existing site and print its id.
"""

import os
import sys
from pathlib import Path

# Allow running as a script.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts.harborseo import (  # noqa: E402
    HarborSeoClient,
)

SITE_ID_CACHE_PATH = Path(__file__).resolve().parent / "_seeds" / ".site_id"


def main() -> int:
    if not os.environ.get("HARBORSEO_API_KEY"):
        print("✗ HARBORSEO_API_KEY not set", file=sys.stderr)
        print("  Get one at https://harborseo.ai/dashboard, then:", file=sys.stderr)
        print("    export HARBORSEO_API_KEY=hrb_live_...", file=sys.stderr)
        return 2

    client = HarborSeoClient()
    print(f"→ Using base URL: {client.base_url}")
    print(f"→ Using API key:  {client.api_key[:12]}…")

    # 1. Verify auth
    print("\n→ Verifying API key against /v1/account …")
    try:
        info = client.get_account()
    except Exception as e:
        print(f"  ✗ /v1/account failed: {e}", file=sys.stderr)
        print(
            "  Check that HARBORSEO_API_KEY is valid and the base "
            f"URL is reachable ({client.base_url}).",
            file=sys.stderr,
        )
        return 1
    articles_remaining = info.get("articles_remaining", "?")
    plan = info.get("plan", "?")
    print(f"  ✓ plan={plan}  articles_remaining={articles_remaining}")

    # 2. List existing sites
    print("\n→ Listing existing sites …")
    try:
        sites = client.list_sites()
    except Exception as e:
        print(f"  ✗ /v1/sites failed: {e}", file=sys.stderr)
        return 1
    for s in sites:
        print(
            f"  {s.id}  {s.domain:30s}  {'active' if s.is_active else 'inactive'}  {s.name}"
        )

    # 3. Find or create propdfs.com
    print("\n→ Resolving propdfs.com …")
    existing = next((s for s in sites if s.domain.lower() == "propdfs.com"), None)
    if existing:
        site = existing
        print(f"  ✓ site already registered: {site.id}")
    else:
        print("  not found, registering …")
        try:
            site = client.create_site(
                domain="propdfs.com",
                name="ProPDFs",
                sitemap_url="https://propdfs.com/sitemap.xml",
                business_summary=(
                    "32 PDF tools in one place — merge, split, compress, "
                    "convert, edit, sign, OCR, and translate. In-browser, "
                    "end-to-end encrypted, GDPR-ready, WCAG 2.1 AA."
                ),
            )
        except Exception as e:
            print(f"  ✗ /v1/sites POST failed: {e}", file=sys.stderr)
            return 1
        print(f"  ✓ registered: {site.id}")

    # 4. Cache the site_id for the publish script
    SITE_ID_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    SITE_ID_CACHE_PATH.write_text(site.id, encoding="utf-8")
    print(f"\n→ Cached site_id at {SITE_ID_CACHE_PATH.relative_to(Path.cwd())}")

    # 5. Sanity check: list articles on the site
    print("\n→ Listing existing articles for this site …")
    try:
        articles = client.list_articles(site_id=site.id)
        print(f"  {len(articles)} article(s)")
        for a in articles[:5]:
            print(
                f"    {a.get('id', '?')[:24]}  "
                f"{(a.get('status') or '?'):10s}  "
                f"{(a.get('title') or '?')[:60]}"
            )
    except Exception as e:
        print(f"  ⚠ /v1/articles failed: {e}", file=sys.stderr)
        print("  (the site is registered, but listing failed; check the API shape)")

    print("\n✓ Setup complete. You can now run publish_queued_posts.py.")
    print(f"  site_id: {site.id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
