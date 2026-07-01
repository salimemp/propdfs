# SEO + blog automation

This directory contains the SEO + content pipeline for ProPDFs. The
goal is to keep the site ranking well on the long tail of
"[pdf tool] online free" queries without us having to remember to
audit it or write a post every week.

## What you need to provide

| Secret | Where it goes | What it does |
|---|---|---|
| `HARBORSEO_API_KEY` | GitHub Actions secret + local env | Audits sites + generates posts |
| `PROPDFS_ADMIN_TOKEN` | GitHub Actions secret + local env | Bearer token for an **admin user** (`is_admin=True`), used to POST to `/api/v1/blog/posts` |
| `PROPDFS_API` | GitHub Actions secret + local env | Base URL of the backend, defaults to `https://api.propdfs.com/api/v1` |

**Tell me when you want me to wire these in.** Once the API key is set:

1. The GitHub Action `.github/workflows/seo.yml` runs the audit
   weekly and posts a downloadable report artifact.
2. `scripts/publish_queued_posts.py` reads `scripts/_seeds/topics.json`
   and publishes each queued topic via harborseo → backend.

Until then, everything works offline:
- `harborseo.py audit --dry-run` returns findings from a deterministic
  local audit (no API credits burned).
- `harborseo.py blog` writes a placeholder post to
  `scripts/_generated_posts/<slug>.json` for review.

## Scripts

### `harborseo.py audit`
Run an SEO audit on one or more domains.

```bash
# Local dry-run (default — no API key needed)
python scripts/harborseo.py audit --domain propdfs.com --dry-run

# With the API key — fetches real findings
HARBORSEO_API_KEY=sk-... python scripts/harborseo.py audit \
    --domain propdfs.com \
    --domain app.getpdfpro.com

# Apply safe fixes automatically (open a PR with the diff)
HARBORSEO_API_KEY=sk-... python scripts/harborseo.py audit \
    --domain propdfs.com --apply
```

Findings are bucketed as:
- `error`     — missing critical SEO element; fix immediately
- `warning`   — measurable impact; fix within the week
- `info`      — nice-to-have; backlog

Findings with codes in the `SAFE_TO_APPLY` set inside `harborseo.py`
are applied mechanically with `--apply`. Everything else is logged for
human review.

### `harborseo.py blog`
Generate an SEO-optimised long-form post on a topic.

```bash
# Just generate (writes JSON to scripts/_generated_posts/)
python scripts/harborseo.py blog \
    --topic "How to merge PDF files online for free" \
    --keywords "merge pdf,combine pdf,join pdf" \
    --category tutorial

# Quality-gate then publish to the live blog
HARBORSEO_API_KEY=sk-... PROPDFS_ADMIN_TOKEN=ey... \
    python scripts/harborseo.py blog \
    --topic "How to compress a PDF without losing quality" \
    --keywords "compress pdf,reduce pdf size" \
    --category guide \
    --min-words 800 \
    --publish
```

The script runs sanity checks before publishing:
- Word count above `--min-words`
- `meta_description` at least 80 chars
- Each top-3 keyword appears in the body
- Slug is URL-safe and ≤ 80 chars

Use `--strict` to abort if any check fails. Otherwise the post is
written locally so you can review.

### `publish_queued_posts.py`
Read `scripts/_seeds/topics.json` and publish each topic.

```bash
HARBORSEO_API_KEY=sk-... PROPDFS_ADMIN_TOKEN=ey... \
    python scripts/publish_queued_posts.py
```

Idempotent — skips posts whose slug already exists in the live blog.

## Adding a new topic to the queue

Edit `scripts/_seeds/topics.json`:

```json
{
  "topic": "How to redact a PDF for free",
  "keywords": ["redact pdf", "black out pdf text", "remove sensitive pdf"],
  "category": "guide",
  "target_words": 1500
}
```

Open a PR. The next workflow_dispatch run will pick it up.

## Where the auto-publish endpoints live

`POST /api/v1/blog/posts` in `backend/app/api/blog.py`. This endpoint
is **gated behind the `require_admin` dependency** — the caller must
present a valid JWT Bearer token for a user whose `is_admin` column is
`True`. Unauthenticated or non-admin requests receive a 401/403
response. The `PROPDFS_ADMIN_TOKEN` secret must therefore be a valid
JWT for an admin user, not a static shared-secret.
