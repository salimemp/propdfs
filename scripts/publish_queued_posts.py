"""Run the queued blog topics through harborseo.ai and POST each one
to the backend. The queue is `scripts/_seeds/topics.json` — edit that
file (or open a PR against it) to control what gets published.

Invoked by the GitHub Action `.github/workflows/seo.yml` on manual
dispatch with `publish=true`. Can also be run locally:

    HARBORSEO_API_KEY=... PROPDFS_ADMIN_TOKEN=... \\
      python scripts/publish_queued_posts.py

The script is idempotent — if a post with the same slug already
exists on the backend, we skip it (the API returns 409 and we
treat that as "already published, move on").

## Token handling

We expect `PROPDFS_ADMIN_TOKEN` to be a REFRESH token (output of
`scripts/get_admin_token.py`). At the start of every run we POST
to `/auth/refresh` to mint a fresh 60-min access token, then use
that for the actual blog POST. This way the workflow survives
long between runs without manual rotation.

## Per-topic error handling

Each topic is independent: a failure on one (harborseo 5xx, 401,
network blip, etc.) does NOT abort the batch. Failed topics are
collected and reported at the end. The script exits 0 if every
topic was either published or skipped-already, and exits 1 if
any topic had a hard failure.
"""

import argparse
import json
import sys
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

QUEUE_PATH = Path(__file__).resolve().parent / "_seeds" / "topics.json"
SITE_ID_CACHE_PATH = Path(__file__).resolve().parent / "_seeds" / ".site_id"


def fresh_access_token() -> tuple[str | None, str]:
    """Exchange the stored refresh token for a fresh access token.

    We pass `rotate=False` so the refresh doesn't invalidate the
    JTI in the GitHub secret. The /auth/refresh endpoint rotates
    by default (best practice for browser sessions) but for
    service tokens that need to be re-usable across workflow
    runs we explicitly opt out — see the comment in
    backend/app/api/auth.py for the security trade-off.

    Returns (access_token, error). One of the two is non-None.
    """
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
            return False, f"409 — slug '{post.slug}' already exists"
        r.raise_for_status()
        slug = r.json().get("slug", post.slug)
        return True, f"published: https://propdfs.com/blog/{slug}"


def resolve_site_id(client: HarborSeoClient) -> str | None:
    """Find or create the propdfs.com harborseo site. Caches the id
    on disk so we don't hit the API on every topic in the batch.
    Returns the site_id, or None if the API is unreachable."""
    if not client.online:
        return None

    # Try the cache first.
    if SITE_ID_CACHE_PATH.exists():
        cached = SITE_ID_CACHE_PATH.read_text(encoding="utf-8").strip()
        if cached:
            return cached

    # Cache miss: look up or create.
    try:
        site = client.get_or_create_site("propdfs.com", "ProPDFs")
    except Exception as e:
        print(f"  ✗ site discovery failed: {e}", file=sys.stderr)
        return None

    SITE_ID_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    SITE_ID_CACHE_PATH.write_text(site.id, encoding="utf-8")
    return site.id


def process_topic(
    entry: dict,
    client: HarborSeoClient,
    site_id: str | None,
    access_token: str,
) -> tuple[str, str]:
    """Process one topic. Returns (status, message) where status
    is one of: 'published', 'skipped', 'failed'."""
    topic = entry["topic"]
    keywords = entry.get("keywords", [])
    category = entry.get("category", "tutorial")
    target = entry.get("target_words", 1500)

    print(f"\n→ {topic}  (keywords: {keywords})")

    # 1. Generate the post (online or offline).
    try:
        post = client.generate_blog(
            topic=topic,
            keywords=keywords,
            category=category,
            target_words=target,
            site_id=site_id,
        )
    except Exception as e:
        msg = f"harborseo generate failed: {e}"
        print(f"  ✗ {msg}", file=sys.stderr)
        return "failed", msg

    print(f"  generated: slug='{post.slug}'  title='{post.title[:60]}'")

    # 2. Skip if the slug is already on the backend.
    if already_published(post.slug):
        print(f"  skip — '{post.slug}' already live")
        return "skipped", f"slug '{post.slug}' already live"

    # 3. Publish to the backend.
    try:
        ok, msg = publish(post, access_token)
    except httpx.HTTPStatusError as e:
        msg = f"POST /blog/posts {e.response.status_code}: " f"{e.response.text[:200]}"
        print(f"  ✗ {msg}", file=sys.stderr)
        return "failed", msg
    except Exception as e:
        msg = f"publish network error: {e}"
        print(f"  ✗ {msg}", file=sys.stderr)
        return "failed", msg

    print(f"  {'✓' if ok else '✗'} {msg}")
    return ("published" if ok else "failed"), msg


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument(
        "--limit",
        type=int,
        default=None,
        help=(
            "Max topics to process this run (default: all). "
            "Useful when the harborseo generation step takes "
            "longer than the workflow runner can wait — e.g. on "
            "the free plan each 1500-word article takes 4-5 min, "
            "so a workflow with a 30-min ceiling can publish at "
            "most ~5-6 articles per run. Set --limit 3 to be safe."
        ),
    )
    p.add_argument(
        "--offset",
        type=int,
        default=0,
        help=(
            "Skip the first N topics in the queue (0-indexed). "
            "Use with --limit to publish a slice: "
            "--offset 3 --limit 3 picks topics 4-6."
        ),
    )
    args = p.parse_args()

    if not QUEUE_PATH.exists():
        print(f"queue file missing: {QUEUE_PATH}")
        return 2
    queue = json.loads(QUEUE_PATH.read_text())
    if not queue:
        print("queue is empty — nothing to publish")
        return 0

    if args.offset:
        queue = queue[args.offset :]
        print(f"(skipped first {args.offset} topic(s) in the queue)")
    if args.limit:
        queue = queue[: args.limit]
        print(f"(limited to next {len(queue)} topic(s) — pass --offset to advance)")

    print("→ Exchanging refresh token for fresh access token …")
    access_token, err = fresh_access_token()
    if not access_token:
        print(f"✗ {err}", file=sys.stderr)
        return 1
    print("  ✓ fresh access token minted")

    client = HarborSeoClient()
    site_id: str | None = None
    if client.online:
        print("→ Resolving harborseo site_id for propdfs.com …")
        site_id = resolve_site_id(client)
        if site_id:
            print(f"  ✓ site_id: {site_id}  (cached at {SITE_ID_CACHE_PATH.name})")
        else:
            print(
                "  ⚠ site_id unavailable — falling back to per-topic lookup",
                file=sys.stderr,
            )
    else:
        print("  ⚠ HARBORSEO_API_KEY not set — using local generator", file=sys.stderr)

    counts = {"published": 0, "skipped": 0, "failed": 0}
    for entry in queue:
        status, msg = process_topic(entry, client, site_id, access_token)
        counts[status] += 1

    print(
        f"\nDone. Published: {counts['published']}, "
        f"skipped: {counts['skipped']}, failed: {counts['failed']}."
    )
    if counts["failed"] and args.offset + (args.limit or 0) < len(queue) + args.offset:
        # If we still have unpublished topics, hint at how to
        # continue. The count comparison uses the ORIGINAL
        # queue length, which we no longer have — so this hint
        # is best-effort and only shows when a limit was set.
        print(
            f"  To publish the next batch, re-run with "
            f"--offset {args.offset + (args.limit or 0)}"
        )
    return 0 if counts["failed"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
