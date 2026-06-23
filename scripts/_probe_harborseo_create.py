#!/usr/bin/env python3
"""
One-shot diagnostic: try several candidate POST /v1/articles body
shapes against the real harborseo API and report which one (if any)
returns 200/201. The current `HarborSeoClient.create_article` ships
with a best-guess shape; if it's wrong, run this script with your
HARBORSEO_API_KEY to discover the working one, then send me the
output so I can update the client.

Usage:
    export HARBORSEO_API_KEY="hrb_live_..."
    python scripts/_probe_harborseo_create.py

The script is read-only-ish: it issues POSTs to /v1/articles, which
CREATES draft articles. It does NOT poll for completion (to keep
runtime short), so the generated articles will sit in your
harborseo account as "pending" until you delete them. We try to
delete the test articles at the end if the API exposes a DELETE
endpoint; otherwise you'll see ~5-7 unused articles in your
account. The articles don't count against your "articles_remaining"
quota until they reach the generation stage, so this is mostly a
cleanliness issue.

The site_id is auto-discovered (first site on the account), or
override with --site-id.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--site-id", help="Override site_id (default: first site)")
    p.add_argument(
        "--topic",
        default="API shape probe (please ignore)",
        help="Topic for the test article",
    )
    p.add_argument(
        "--keywords",
        default="probe,diagnostic,ignore",
        help="Comma-separated keywords for the test article",
    )
    p.add_argument(
        "--base-url",
        default="https://outgoing-oyster-428.convex.site/v1",
    )
    args = p.parse_args()

    api_key = os.environ.get("HARBORSEO_API_KEY")
    if not api_key:
        print("✗ HARBORSEO_API_KEY not set", file=sys.stderr)
        return 2

    base = args.base_url.rstrip("/")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    # 1. Resolve site_id
    site_id = args.site_id
    if not site_id:
        print("→ Looking up first available site …")
        with httpx.Client(timeout=15.0) as c:
            r = c.get(f"{base}/sites", headers=headers)
            r.raise_for_status()
            data = r.json()
            items = data.get("data", data) if isinstance(data, dict) else data
            if not items:
                print("  ✗ no sites registered — run scripts/setup_harborseo.py first")
                return 1
            site_id = items[0]["id"]
            print(f"  using site: {items[0].get('domain', '?')}  ({site_id})")

    # 2. Try several candidate body shapes
    candidates = [
        {
            "label": "current client shape (site_id, topic, keywords, type, target_word_count, language)",
            "body": {
                "site_id": site_id,
                "topic": args.topic,
                "keywords": [k.strip() for k in args.keywords.split(",") if k.strip()],
                "target_word_count": 500,
                "language": "en",
                "type": "article",
            },
        },
        {
            "label": "minimal (site_id + title)",
            "body": {
                "site_id": site_id,
                "title": args.topic,
            },
        },
        {
            "label": "minimal (site_id + topic)",
            "body": {
                "site_id": site_id,
                "topic": args.topic,
            },
        },
        {
            "label": "site_id + topic + keywords (no target_word_count)",
            "body": {
                "site_id": site_id,
                "topic": args.topic,
                "keywords": [k.strip() for k in args.keywords.split(",") if k.strip()],
            },
        },
        {
            "label": "site_id + topic + keywords + word_count (not target_word_count)",
            "body": {
                "site_id": site_id,
                "topic": args.topic,
                "keywords": [k.strip() for k in args.keywords.split(",") if k.strip()],
                "word_count": 500,
            },
        },
        {
            "label": "site_id + topic + tone_of_voice (inheriting site defaults)",
            "body": {
                "site_id": site_id,
                "topic": args.topic,
                "tone_of_voice": "persuasive",
            },
        },
    ]

    print(f"\n→ Probing {len(candidates)} body shapes against {base}/articles …\n")
    for c in candidates:
        body = c["body"]
        print(f"  → {c['label']}")
        print(f"     body keys: {sorted(body.keys())}")
        try:
            with httpx.Client(timeout=30.0) as cli:
                r = cli.post(f"{base}/articles", json=body, headers=headers)
                status = r.status_code
                text = r.text[:300] if r.text else "(no body)"
                print(f"     {status}  {text[:200]}")
                if status in (200, 201):
                    print(f"     ✓ working shape: {c['label']}")
                    print()
                    print(
                        f"     Full body that worked:\n     {json.dumps(body, indent=6)}"
                    )
                    return 0
        except Exception as e:
            print(f"     ✗ {e}")
        print()

    print("✗ No candidate shape returned 200/201.")
    print("  The first shape's 400 error above is the most likely candidate to")
    print("  succeed with a tweak — paste it to me and I'll fix the client.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
