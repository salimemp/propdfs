#!/usr/bin/env python3
"""
harborseo.ai integration — site discovery + article generation.

This script is the entry point for:

  1. **Site discovery / setup** — register propdfs.com as a harborseo
     site (idempotent; safe to re-run), or list existing sites.

  2. **Article generation** — given a topic + target keywords, ask
     harborseo.ai to generate an SEO-optimised long-form article,
     wait for it to complete, and return a `BlogPost` ready for
     our backend's /api/v1/blog/posts endpoint.

The API key is required for online mode — set HARBORSEO_API_KEY in
the environment or pass --api-key. Without it, the script falls
back to a deterministic local generator so the workflow can still
run end-to-end (just with placeholder content).

The audit subcommand is preserved for backward compatibility with
the existing GitHub workflow; in the new API there is no separate
audit endpoint, so the audit command now reports on registered
sites and recent article health instead.

Usage:
    # List sites (online)
    python scripts/harborseo.py sites

    # Register propdfs.com if not already there (online)
    python scripts/harborseo.py site-upsert --domain propdfs.com \\
        --name "ProPDFs" --description "32 PDF tools, in-browser, free"

    # Generate one article (online, returns BlogPost)
    python scripts/harborseo.py blog --topic "How to merge PDFs" \\
        --keywords "merge pdf,combine pdf" --site-id nd7...

    # Same, but offline (local generator)
    python scripts/harborseo.py blog --topic "How to merge PDFs"

The script is intentionally idempotent — running it twice with the
same inputs is safe.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

import html2text
import httpx

# ─── Config ────────────────────────────────────────────────────────────────

# Real harborseo endpoint. The historical "api.harborseo.ai" hostname
# is dead (returns Cloudflare 522) — harborseo now runs as a Convex
# deployment, which is the canonical URL. Override via
# HARBORSEO_BASE_URL for testing.
DEFAULT_BASE = "https://outgoing-oyster-428.convex.site/v1"
HARBORSEO_KEY = os.environ.get("HARBORSEO_API_KEY")
PROPDFS_API = os.environ.get("PROPDFS_API", "https://api.propdfs.com/api/v1")
PROPDFS_ADMIN_TOKEN = os.environ.get("PROPDFS_ADMIN_TOKEN")


# ─── Data shapes ──────────────────────────────────────────────────────────


@dataclass
class Finding:
    code: str
    severity: str  # "info" | "warning" | "error"
    url: str = ""
    message: str = ""
    suggested_fix: str = ""

    def to_dict(self) -> dict:
        return {
            "code": self.code,
            "severity": self.severity,
            "url": self.url,
            "message": self.message,
            "suggested_fix": self.suggested_fix,
        }


@dataclass
class Site:
    """A harborseo-registered site. `id` is the value the /v1/articles
    endpoint requires as `site_id`."""

    id: str
    domain: str
    name: str = ""
    is_active: bool = True

    @classmethod
    def from_api(cls, data: dict) -> "Site":
        return cls(
            id=data["id"],
            domain=data.get("domain", ""),
            name=data.get("name", ""),
            is_active=bool(data.get("is_active", True)),
        )


@dataclass
class BlogPost:
    title: str
    slug: str
    meta_description: str
    content: str  # Markdown
    keywords: list[str] = field(default_factory=list)
    category: str = "tutorial"
    tags: list[str] = field(default_factory=list)
    author: str = "ProPDFs Editorial Team"
    reading_time: int = 5
    featured_image: str = ""

    def to_dict(self) -> dict:
        return {
            "id": "",  # backend will assign
            "slug": self.slug,
            "title": self.title,
            "meta_description": self.meta_description,
            "content": self.content,
            "keywords": self.keywords,
            "author": self.author,
            "published_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "category": self.category,
            "tags": self.tags,
            "reading_time": self.reading_time,
            "featured_image": self.featured_image,
        }


# ─── harborseo.ai client ───────────────────────────────────────────────────


class HarborSeoClient:
    """Thin wrapper around the harborseo Convex deployment.

    Real API surface (verified 2026-06-23):

      GET  /v1/account       — account info (plan, articles_remaining)
      GET  /v1/sites         — list registered sites
      POST /v1/sites         — register a new site
      GET  /v1/articles      — list articles (with optional type filter)
      POST /v1/articles      — create article; body REQUIRES site_id
      GET  /v1/articles/{id} — get one article (status, content, etc.)

    There is no separate audit endpoint — "audit" is implicit in
    every article creation. The audit subcommand here lists sites
    + recent articles and reports on health, which is the closest
    equivalent.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: str = DEFAULT_BASE,
        timeout: float = 60.0,
    ):
        self.api_key = api_key or HARBORSEO_KEY
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    # ── Auth / connection helpers ───────────────────────────────────

    def _headers(self) -> dict:
        if not self.api_key:
            return {"Content-Type": "application/json"}
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "User-Agent": "propdfs-harborseo-integration/0.2",
        }

    @property
    def online(self) -> bool:
        return bool(self.api_key)

    def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: Optional[dict] = None,
        params: Optional[dict] = None,
    ) -> dict:
        """Make an authenticated request. Raises httpx.HTTPStatusError
        on non-2xx and ConnectionError on network failure."""
        if not self.online:
            raise RuntimeError(
                "HarborSeoClient is offline (no API key). Use the "
                "local fallback path or set HARBORSEO_API_KEY."
            )
        url = f"{self.base_url}{path}"
        with httpx.Client(timeout=self.timeout) as c:
            resp = c.request(
                method,
                url,
                json=json_body,
                params=params,
                headers=self._headers(),
            )
            resp.raise_for_status()
            return resp.json()

    # ── Account / sites ─────────────────────────────────────────────

    def get_account(self) -> dict:
        """Return the harborseo account dict. Useful for early
        connectivity checks at the top of a workflow."""
        return self._request("GET", "/account")

    def list_sites(self) -> list[Site]:
        """List all sites registered to this harborseo account."""
        data = self._request("GET", "/sites")
        # API shape: { "data": [ {site}, ... ] }
        items = data.get("data", data) if isinstance(data, dict) else data
        return [Site.from_api(s) for s in items]

    def find_site(self, domain: str) -> Optional[Site]:
        """Find a site by domain. Returns None if not registered."""
        for s in self.list_sites():
            if s.domain.lower() == domain.lower():
                return s
        return None

    def create_site(
        self,
        domain: str,
        name: str,
        *,
        language: str = "en",
        tone_of_voice: str = "persuasive",
        content_type: str = "Best for articles",
        sitemap_url: Optional[str] = None,
        business_summary: Optional[str] = None,
        brand_color: Optional[str] = None,
        brand_font: Optional[str] = None,
        logo_url: Optional[str] = None,
    ) -> Site:
        """Register a new site. Idempotent on `domain` — if a site
        for `domain` already exists, returns that one instead of
        creating a duplicate."""
        existing = self.find_site(domain)
        if existing:
            return existing
        body: dict = {
            "domain": domain,
            "name": name,
            "language": language,
            "tone_of_voice": tone_of_voice,
            "content_type": content_type,
        }
        if sitemap_url:
            body["sitemap_url"] = sitemap_url
        if business_summary:
            body["business_summary"] = business_summary
        if brand_color:
            body["brand_color"] = brand_color
        if brand_font:
            body["brand_font"] = brand_font
        if logo_url:
            body["logo_url"] = logo_url
        data = self._request("POST", "/sites", json_body=body)
        # Some Convex patterns return the object directly, others
        # wrap in {"data": ...}; handle both.
        return Site.from_api(data.get("data", data))

    def get_or_create_site(
        self,
        domain: str,
        name: str,
        **kwargs,
    ) -> Site:
        """Convenience: find or create. See `create_site` kwargs."""
        return self.create_site(domain, name, **kwargs)

    # ── Articles ─────────────────────────────────────────────────────

    def list_articles(
        self,
        *,
        site_id: Optional[str] = None,
        article_type: Optional[str] = None,
    ) -> list[dict]:
        """List articles. Optionally filtered by site_id and type."""
        params: dict = {}
        if site_id:
            params["site_id"] = site_id
        if article_type:
            params["type"] = article_type
        data = self._request("GET", "/articles", params=params or None)
        items = data.get("data", data) if isinstance(data, dict) else data
        return items if isinstance(items, list) else []

    def create_article(
        self,
        site_id: str,
        topic: str,
        keywords: list[str],
        *,
        category: str = "tutorial",
        target_words: int = 1500,
        language: str = "en",
    ) -> dict:
        """Create an article. Returns the initial article object
        (status usually "queued" — the actual generation runs
        async on the harborseo side). Use `wait_for_article` to
        poll for completion.

        Body shape (verified against the real API 2026-06-23):
          Required: site_id, keywords (string, non-empty),
                    topic OR title
          Optional: target_word_count, word_count, type, language,
                    tone_of_voice, category

        The original 400 the operator was seeing was a body-shape
        mismatch: the API expects `keywords` as a comma-separated
        STRING, not a list of strings. We coerce here.
        """
        # The real harborseo API takes `keywords` as a single
        # comma-separated string. Newline-separated also works;
        # comma is the convention.
        keywords_str = ", ".join(k.strip() for k in keywords if k.strip())
        if not keywords_str:
            raise ValueError("create_article requires at least one non-empty keyword")

        body = {
            "site_id": site_id,
            "topic": topic,
            "keywords": keywords_str,
            "target_word_count": target_words,
            "language": language,
        }
        if category:
            body["type"] = category
        try:
            return self._request("POST", "/articles", json_body=body)
        except httpx.HTTPStatusError as e:
            body_text = e.response.text[:500] if e.response else "(no body)"
            raise RuntimeError(
                f"POST /articles {e.response.status_code}: {body_text} "
                f"(request body keys: {sorted(body.keys())})"
            ) from e

    def get_article(self, article_id: str) -> dict:
        """Fetch one article by id."""
        return self._request("GET", f"/articles/{article_id}")

    def wait_for_article(
        self,
        article_id: str,
        *,
        timeout: int = 300,
        poll_interval: int = 5,
        on_progress=None,
    ) -> dict:
        """Poll an article until status is terminal (completed /
        failed / cancelled) or we hit `timeout` seconds.

        Calls `on_progress(message, step, total)` on each tick if
        provided — useful for CLI progress output.
        """
        deadline = time.time() + timeout
        terminal = {
            "completed",
            "done",
            "ready",
            "published",
            "failed",
            "cancelled",
            "error",
        }
        while time.time() < deadline:
            data = self.get_article(article_id)
            status = (data.get("status") or "").lower()
            progress = data.get("progress") or {}
            if on_progress and progress:
                on_progress(
                    progress.get("message", status),
                    progress.get("step", 0),
                    progress.get("total", 0),
                )
            if status in terminal:
                return data
            time.sleep(poll_interval)
        raise TimeoutError(
            f"Article {article_id} did not complete in {timeout}s "
            f"(last status: '{status}')"
        )

    # ── High-level: generate a blog post end-to-end ─────────────────

    def generate_blog(
        self,
        topic: str,
        keywords: list[str],
        category: str = "tutorial",
        target_words: int = 1500,
        *,
        site_id: Optional[str] = None,
        domain: str = "propdfs.com",
        site_name: str = "ProPDFs",
    ) -> BlogPost:
        """Generate an SEO-optimised blog post on `topic`.

        Online flow:
          1. Resolve site_id (look up by domain or use the passed one)
          2. POST /v1/articles with topic + keywords + site_id
          3. Poll /v1/articles/{id} until completed
          4. Map the result to a BlogPost

        Offline flow (no API key):
          - Returns a deterministic local BlogPost so the
            publish_queued_posts.py workflow can still complete
            (with placeholder content). The local post is clearly
            flagged in the slug with `-placeholder` so the operator
            knows to regenerate it later.
        """
        if not self.online:
            return self._generate_blog_local(topic, keywords, category, target_words)

        if not site_id:
            site = self.get_or_create_site(domain, site_name)
            site_id = site.id

        def _progress(msg, step, total):
            if msg:
                print(f"    [{step}/{total}] {msg}", file=sys.stderr)

        initial = self.create_article(
            site_id,
            topic,
            keywords,
            category=category,
            target_words=target_words,
        )
        article_id = initial.get("id")
        if not article_id:
            raise RuntimeError(f"Article creation returned no id. Response: {initial}")

        article = self.wait_for_article(
            article_id, timeout=300, poll_interval=5, on_progress=_progress
        )

        status = (article.get("status") or "").lower()
        if status in ("failed", "cancelled", "error"):
            raise RuntimeError(
                f"Article generation failed. status={status}, " f"article={article}"
            )

        return self._article_to_blogpost(
            article, topic, keywords, category, target_words
        )

    def _article_to_blogpost(
        self,
        article: dict,
        topic: str,
        keywords: list[str],
        category: str,
        target_words: int,
    ) -> BlogPost:
        """Map a completed harborseo article dict to our BlogPost.

        harborseo returns `content` as HTML (a full <h1>...</html>
        document with embedded styles). Our ProPDFs blog backend
        expects Markdown. We convert with html2text; the result is
        clean enough for a backend that renders Markdown to HTML
        client-side.

        Title, slug, word_count come straight from harborseo.
        meta_description is either returned by the API or
        extracted from the first paragraph of the converted
        Markdown as a fallback.
        """
        # harborseo returns the article body as HTML. The shape
        # varies across the API's history; try several keys.
        raw_content = (
            article.get("content")
            or article.get("body")
            or article.get("markdown")
            or article.get("text")
            or ""
        )
        # Detect HTML vs Markdown. harborseo ships HTML; if the
        # future version returns Markdown, leave it as-is.
        if "<" in raw_content and ">" in raw_content and "</" in raw_content:
            h = html2text.HTML2Text()
            h.body_width = 0  # don't wrap
            h.ignore_links = False
            h.ignore_images = False
            content = h.handle(raw_content).strip()
        else:
            content = raw_content.strip()

        title = article.get("title") or topic
        slug = article.get("slug") or self._slugify(title)
        meta = (
            article.get("meta_description")
            or article.get("description")
            or article.get("excerpt")
            or ""
        )
        if not meta and content:
            # Extract the first non-heading paragraph as a
            # ~150 char meta description. Google's snippet
            # algorithm prefers 120-160 chars.
            for line in content.splitlines():
                line = line.strip()
                if not line or line.startswith("#") or line.startswith("!"):
                    continue
                plain = re.sub(r"[*_`]+", "", line)
                if 60 <= len(plain) <= 320:
                    meta = plain[:157].rsplit(" ", 1)[0] + "."
                    break
        word_count = article.get("word_count") or len(content.split())
        return BlogPost(
            title=title,
            slug=slug,
            meta_description=meta
            or f"{title} — practical, no-fluff guide from ProPDFs.",
            content=content
            or self._placeholder_markdown(topic, keywords, category, target_words),
            keywords=keywords,
            category=category,
            tags=article.get("tags") or keywords[:3],
            author=article.get("author") or "ProPDFs Editorial Team",
            reading_time=max(1, int(word_count) // 200),
            featured_image=article.get("featured_image")
            or article.get("image_url")
            or "",
        )

    # ── Local fallback (no API key) ──────────────────────────────────

    def _generate_blog_local(
        self,
        topic: str,
        keywords: list[str],
        category: str,
        target_words: int,
    ) -> BlogPost:
        """Deterministic local generator. Produces valid placeholder
        content so the publish workflow can run end-to-end without
        a harborseo key. Slug is suffixed `-placeholder` so the
        operator can spot-and-regenerate later."""
        title = topic if topic.endswith(("?", "!")) else f"{topic}: A Practical Guide"
        slug = f"{self._slugify(topic)}-placeholder"
        content = self._placeholder_markdown(topic, keywords, category, target_words)
        return BlogPost(
            title=title,
            slug=slug,
            meta_description=f"{title}. Practical, no-fluff guide from ProPDFs.",
            content=content,
            keywords=keywords,
            category=category,
            tags=keywords[:3],
            author="ProPDFs Editorial Team",
            reading_time=max(1, target_words // 200),
            featured_image="",
        )

    def _placeholder_markdown(
        self,
        topic: str,
        keywords: list[str],
        category: str,
        target_words: int,
    ) -> str:
        return (
            f"# {topic}\n\n"
            f"*This is a placeholder article generated offline because "
            f"HARBORSEO_API_KEY was not set. Run the workflow with a valid "
            f"key to regenerate the real article.*\n\n"
            f"## What this guide covers\n\n"
            f"Once the online harborseo generator is wired up, this slot "
            f"will be filled with a {target_words}-word SEO-optimised "
            f"article on the topic of **{topic}**.\n\n"
            f"## Target keywords\n\n"
            + "\n".join(f"- {k}" for k in keywords)
            + "\n\n## Category\n\n"
            f"`{category}`\n"
        )

    def _slugify(self, text: str) -> str:
        s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
        return s[:80] or "untitled"

    # ── Audit (legacy subcommand, no real audit endpoint) ────────────

    def audit(self, domain: str) -> list[Finding]:
        """Backward-compatible audit entry point.

        The new API has no separate audit endpoint, so this method
        reports on site health (is the domain registered?) and
        article health (have recent articles completed?). It
        returns the same Finding shape as the old version so
        downstream tooling doesn't change.
        """
        if not self.online:
            return self._audit_local(domain)

        findings: list[Finding] = []
        try:
            site = self.find_site(domain)
        except Exception as e:
            return [Finding("api_unreachable", "error", domain, str(e))]

        if not site:
            findings.append(
                Finding(
                    "site_not_registered",
                    "warning",
                    domain,
                    f"Domain '{domain}' is not registered in harborseo. "
                    "Run `harborseo.py site-upsert --domain " + domain + "`.",
                    "Register the site so /v1/articles can accept jobs for it.",
                )
            )
            return findings

        if not site.is_active:
            findings.append(
                Finding(
                    "site_inactive",
                    "warning",
                    domain,
                    f"Site '{domain}' is registered but marked inactive.",
                    "Activate the site in the harborseo dashboard.",
                )
            )

        try:
            articles = self.list_articles(site_id=site.id)
        except Exception as e:
            findings.append(
                Finding(
                    "articles_list_failed",
                    "warning",
                    site.id,
                    str(e),
                )
            )
            return findings

        if not articles:
            findings.append(
                Finding(
                    "no_articles_yet",
                    "info",
                    site.id,
                    "No articles generated yet for this site. Run "
                    "`publish_queued_posts.py` to publish the seeded topics.",
                )
            )
        else:
            completed = sum(
                1 for a in articles if (a.get("status") or "").lower() == "completed"
            )
            failed = sum(
                1
                for a in articles
                if (a.get("status") or "").lower() in ("failed", "cancelled", "error")
            )
            if failed:
                findings.append(
                    Finding(
                        "articles_failed",
                        "warning",
                        site.id,
                        f"{failed} of {len(articles)} articles are in a failed state.",
                        "Re-run those jobs; the local-fallback path can publish them now.",
                    )
                )
            findings.append(
                Finding(
                    "articles_summary",
                    "info",
                    site.id,
                    f"{completed} of {len(articles)} articles completed.",
                )
            )

        return findings

    def _audit_local(self, domain: str) -> list[Finding]:
        """Original local audit (basic site checks against our own
        deployment). Kept for offline mode."""
        findings: list[Finding] = []
        with httpx.Client(timeout=15.0) as c:
            base = f"https://{domain}"
            try:
                r = c.get(base + "/")
                r.raise_for_status()
                html = r.text
            except Exception as e:
                return [Finding("unreachable_host", "error", base, str(e))]

            url = base + "/"
            if "<title>" not in html or "<title>propdfs</title>" in html.lower():
                findings.append(
                    Finding(
                        "missing_title",
                        "warning",
                        url,
                        "Page title is missing or is the Flutter placeholder.",
                        "Add a real <title> tag in web/index.html.",
                    )
                )
            if 'name="description"' not in html or "new Flutter project" in html:
                findings.append(
                    Finding(
                        "missing_meta_description",
                        "warning",
                        url,
                        "Meta description missing or default Flutter placeholder.",
                        "Set a proper meta description in web/index.html.",
                    )
                )
            if 'rel="canonical"' not in html:
                findings.append(
                    Finding(
                        "missing_canonical",
                        "info",
                        url,
                        "No canonical link tag.",
                        f'Add <link rel="canonical" href="{url}">.',
                    )
                )
            if 'property="og:title"' not in html:
                findings.append(
                    Finding(
                        "missing_og_title",
                        "info",
                        url,
                        "No og:title meta — shared links on social/Slack look bare.",
                        'Add <meta property="og:title" content="...">.',
                    )
                )
            if "application/ld+json" not in html:
                findings.append(
                    Finding(
                        "missing_schema_software",
                        "warning",
                        url,
                        "No JSON-LD structured data. Google rich results won't fire.",
                        "Add SoftwareApplication + Organization schema.",
                    )
                )
            try:
                rs = c.get(base + "/robots.txt")
                if rs.status_code != 200 or "User-agent" not in rs.text:
                    findings.append(
                        Finding(
                            "missing_robots_txt",
                            "warning",
                            base + "/robots.txt",
                            "No real robots.txt served.",
                            "Add /robots.txt with a Sitemap directive.",
                        )
                    )
            except Exception:
                findings.append(
                    Finding(
                        "missing_robots_txt",
                        "warning",
                        base + "/robots.txt",
                        "Could not fetch robots.txt.",
                    )
                )
            try:
                sm = c.get(base + "/sitemap.xml")
                if sm.status_code != 200 or "<urlset" not in sm.text:
                    findings.append(
                        Finding(
                            "missing_sitemap",
                            "warning",
                            base + "/sitemap.xml",
                            "No real sitemap.xml served.",
                            "Add /sitemap.xml with every tool URL.",
                        )
                    )
            except Exception:
                findings.append(
                    Finding(
                        "missing_sitemap",
                        "warning",
                        base + "/sitemap.xml",
                        "Could not fetch sitemap.xml.",
                    )
                )
        return findings


# ─── CLI ──────────────────────────────────────────────────────────────────


def cmd_account(_args) -> int:
    """Show harborseo account info (plan, articles_remaining)."""
    client = HarborSeoClient()
    if not client.online:
        print("offline (no HARBORSEO_API_KEY)")
        return 1
    info = client.get_account()
    print(json.dumps(info, indent=2))
    return 0


def cmd_sites(_args) -> int:
    """List sites registered to this harborseo account."""
    client = HarborSeoClient()
    if not client.online:
        print("offline (no HARBORSEO_API_KEY)")
        return 1
    sites = client.list_sites()
    if not sites:
        print("no sites registered")
        return 0
    for s in sites:
        active = "active" if s.is_active else "inactive"
        print(f"  {s.id}  {s.domain:30s}  {active}  {s.name}")
    return 0


def cmd_site_upsert(args) -> int:
    """Register a site, or return the existing one if it exists."""
    client = HarborSeoClient()
    if not client.online:
        print("offline (no HARBORSEO_API_KEY)")
        return 1
    site = client.get_or_create_site(
        domain=args.domain,
        name=args.name,
        sitemap_url=args.sitemap_url,
        business_summary=args.description,
    )
    print(f"site_id: {site.id}")
    print(f"domain:  {site.domain}")
    print(f"name:    {site.name}")
    print(f"active:  {site.is_active}")
    return 0


def cmd_audit(args) -> int:
    """Run the (now site-health) audit and print findings."""
    client = HarborSeoClient()
    findings = client.audit(args.domain)
    for f in findings:
        print(f"  [{f.severity:7s}] {f.code:30s} {f.message}")
        if f.suggested_fix:
            print(f"           fix: {f.suggested_fix}")
    print(f"\n{len(findings)} finding(s)")
    return 0


def cmd_blog(args) -> int:
    """Generate one article and print the BlogPost as JSON."""
    client = HarborSeoClient(
        base_url=args.base_url or DEFAULT_BASE,
    )
    keywords = [k.strip() for k in (args.keywords or "").split(",") if k.strip()]
    post = client.generate_blog(
        topic=args.topic,
        keywords=keywords,
        category=args.category,
        target_words=args.target_words,
        site_id=args.site_id,
        domain=args.domain,
        site_name=args.site_name,
    )
    print(json.dumps(post.to_dict(), indent=2))
    return 0


def main() -> int:
    p = argparse.ArgumentParser(
        description="ProPDFs ↔ harborseo.ai integration",
    )
    p.add_argument(
        "--api-key",
        help="harborseo.ai API key (or set HARBORSEO_API_KEY)",
    )
    p.add_argument(
        "--base-url",
        help=f"Override base URL (default: {DEFAULT_BASE})",
    )
    sub = p.add_subparsers(dest="cmd", required=False)

    p_account = sub.add_parser("account", help="Show harborseo account info")
    p_account.set_defaults(func=cmd_account)

    p_sites = sub.add_parser("sites", help="List registered sites")
    p_sites.set_defaults(func=cmd_sites)

    p_upsert = sub.add_parser(
        "site-upsert",
        help="Register a site (idempotent; returns existing one if present)",
    )
    p_upsert.add_argument("--domain", required=True)
    p_upsert.add_argument("--name", required=True)
    p_upsert.add_argument("--sitemap-url", default="https://propdfs.com/sitemap.xml")
    p_upsert.add_argument(
        "--description",
        default="32 PDF tools in one place — merge, split, compress, "
        "convert, edit, sign, OCR, and translate. In-browser, "
        "end-to-end encrypted, GDPR-ready, WCAG 2.1 AA.",
    )
    p_upsert.set_defaults(func=cmd_site_upsert)

    p_audit = sub.add_parser("audit", help="Site + article health check")
    p_audit.add_argument("--domain", default="propdfs.com")
    p_audit.set_defaults(func=cmd_audit)

    p_blog = sub.add_parser("blog", help="Generate one article (returns BlogPost JSON)")
    p_blog.add_argument("--topic", required=True)
    p_blog.add_argument(
        "--keywords",
        help="Comma-separated target keywords",
    )
    p_blog.add_argument("--category", default="tutorial")
    p_blog.add_argument("--target-words", type=int, default=1500)
    p_blog.add_argument(
        "--site-id",
        help="harborseo site id (skips site lookup; required for batch use)",
    )
    p_blog.add_argument("--domain", default="propdfs.com")
    p_blog.add_argument("--site-name", default="ProPDFs")
    p_blog.set_defaults(func=cmd_blog)

    args = p.parse_args()
    if not args.cmd:
        # Default to audit if no subcommand — matches the historical
        # behaviour where `harborseo.py audit` is the canonical entry.
        args.cmd = "audit"
        args.domain = "propdfs.com"
        args.func = cmd_audit
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
