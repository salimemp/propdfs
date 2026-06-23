#!/usr/bin/env python3
"""
Run the queued blog topics through harborseo.ai and POST each one to
the backend. The queue is `scripts/_seeds/topics.json` — edit that
file (or open a PR against it) to control what gets published.

Invoked by the GitHub Action `.github/workflows/seo.yml` on manual
dispatch with `publish=true`. Can also be run locally:

    HARBORSEO_API_KEY=... PROPDFS_ADMIN_TOKEN=... \
      python scripts/publish_queued_posts.py

The script is idempotent — if a post with the same slug already exists
on the backend, we skip it (the API returns 409 and we treat that as
"already published, move on").
"""
import json
import os
import sys
from pathlib import Path

# Allow running as a script.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts.harborseo import HarborSeoClient, BlogPost, PROPDFS_API, PROPDFS_ADMIN_TOKEN  # noqa: E402

import httpx  # noqa: E402


QUEUE_PATH = Path(__file__).resolve().parent / "_seeds" / "topics.json"


def already_published(slug: str) -> bool:
    """Check the blog index — if our slug is there, skip."""
    try:
        with httpx.Client(timeout=15.0) as c:
            r = c.get(f"{PROPDFS_API}/blog/posts", params={"search": slug})
            r.raise_for_status()
            for item in r.json():
                if item.get("slug") == slug:
                    return True
    except Exception as e:
        print(f"[publish] (warn) could not check existing posts: {e}")
    return False


def publish(post: BlogPost) -> tuple[bool, str]:
    if not PROPDFS_ADMIN_TOKEN:
        return False, "PROPDFS_ADMIN_TOKEN not set"
    with httpx.Client(timeout=30.0) as c:
        r = c.post(
            f"{PROPDFS_API}/blog/posts",
            json=post.to_dict(),
            headers={
                "Authorization": f"Bearer {PROPDFS_ADMIN_TOKEN}",
                "Content-Type": "application/json",
            },
        )
        if r.status_code == 409:
            return False, f"409 — slug '{post.slug}' already exists"
        r.raise_for_status()
        slug = r.json().get("slug", post.slug)
        return True, f"published: https://propdfs.com/blog/{slug}"


def main() -> int:
    if not QUEUE_PATH.exists():
        print(f"queue file missing: {QUEUE_PATH}")
        return 2
    queue = json.loads(QUEUE_PATH.read_text())
    if not queue:
        print("queue is empty — nothing to publish")
        return 0

    client = HarborSeoClient()
    published = 0
    skipped = 0
    failed = 0

    for entry in queue:
        topic = entry["topic"]
        keywords = entry.get("keywords", [])
        category = entry.get("category", "tutorial")
        target = entry.get("target_words", 1500)
        print(f"\n→ {topic}  (keywords: {keywords})")
        post = client.generate_blog(topic, keywords, category, target)
        if already_published(post.slug):
            print(f"  skip — '{post.slug}' already live")
            skipped += 1
            continue
        ok, msg = publish(post)
        print(f"  {'✓' if ok else '✗'} {msg}")
        if ok:
            published += 1
        else:
            failed += 1

    print(f"\nDone. Published: {published}, skipped: {skipped}, failed: {failed}.")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
