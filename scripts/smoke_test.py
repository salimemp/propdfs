#!/usr/bin/env python3
"""
Post-deploy smoke test for the ProPDFs backend.

Hits every public + a couple of protected endpoints and reports which
ones work, which need fixing, and which are silently broken.

Usage:
    python scripts/smoke_test.py https://your-api.example.com

The script deliberately distinguishes:
  - 2xx  → working
  - 401  → working but needs auth (expected for protected endpoints)
  - 404  → endpoint missing
  - 500  → backend error (fix needed)
  - network error → can't reach the host

Exit code: 0 if every required endpoint works (or is properly auth-gated),
non-zero otherwise.
"""
import argparse
import json
import sys
import time
from typing import Optional
from urllib.parse import urljoin

import httpx


# Endpoints we expect to exist, grouped by expected status.
# Each entry: (path, method, expected_status, auth_required, label)
EXPECTED = [
    # Public
    ("/api/v1/health",          "GET",  200, False, "health check"),
    ("/api/v1/",                "GET",  200, False, "root"),
    ("/api/v1/auth/register",   "POST", [201, 400, 422], False, "register endpoint"),
    ("/api/v1/auth/login",      "POST", [401, 422], False, "login endpoint"),
    ("/api/v1/auth/forgot-password", "POST", [200, 422], False, "forgot-password endpoint"),
    ("/api/v1/auth/magic-link", "POST", [200, 422, 404], False, "magic-link endpoint"),
    ("/api/v1/auth/refresh",    "POST", [401, 422], False, "refresh endpoint"),
    ("/api/v1/blog/categories", "GET",  200, False, "blog categories"),
    ("/api/v1/blog/posts",      "GET",  200, False, "blog list"),
    ("/api/v1/blog/posts/welcome-to-propdfs", "GET", [200, 404], False, "blog detail"),

    # Auth-gated
    ("/api/v1/auth/me",         "GET",  401, True,  "current-user (needs auth)"),
    ("/api/v1/auth/2fa/setup",  "POST", 401, True,  "2FA setup (needs auth)"),
    ("/api/v1/documents/upload","POST", 401, True,  "document upload (needs auth)"),
    ("/api/v1/process/",        "POST", 401, True,  "process queue (needs auth)"),
]


def color(s: str, code: str) -> str:
    """ANSI-color a status string if we're on a TTY."""
    if not sys.stdout.isatty():
        return s
    codes = {"green": "32", "red": "31", "yellow": "33", "dim": "90", "cyan": "36"}
    return f"\033[{codes.get(code, '0')}m{s}\033[0m"


def check(client: httpx.Client, base: str, path: str, method: str,
          expected, auth: bool) -> tuple[bool, str, Optional[str]]:
    expected_list = expected if isinstance(expected, list) else [expected]
    url = urljoin(base.rstrip("/") + "/", path.lstrip("/"))
    try:
        if method == "GET":
            resp = client.get(url, timeout=10)
        elif method == "POST":
            # Most POST endpoints here reject missing body → expect a
            # 4xx, never the actual mutation.
            resp = client.post(url, json={}, timeout=10)
        else:
            return False, f"unsupported method {method}", None
    except httpx.HTTPError as e:
        return False, f"network error: {e.__class__.__name__}: {e}", None

    ok = resp.status_code in expected_list
    body = None
    try:
        body = resp.json()
    except Exception:
        body = resp.text[:200] if resp.text else None

    return ok, f"{resp.status_code}", body


def main() -> int:
    p = argparse.ArgumentParser(description="ProPDFs backend smoke test")
    p.add_argument("base_url", help="Backend base URL, e.g. https://api.propdfs.com")
    p.add_argument("--token", help="Bearer token for auth-gated tests", default=None)
    p.add_argument("--json", action="store_true", help="Machine-readable output")
    args = p.parse_args()

    base = args.base_url
    headers = {"Authorization": f"Bearer {args.token}"} if args.token else {}
    timeout = httpx.Timeout(10.0, connect=5.0)

    results = []
    failures = 0

    with httpx.Client(headers=headers, timeout=timeout) as client:
        for path, method, expected, auth, label in EXPECTED:
            if auth and not args.token:
                # We can't probe auth-gated endpoints without a token,
                # but record that we skipped.
                results.append({
                    "path": path, "label": label,
                    "status": "skipped", "ok": True,
                    "note": "no --token",
                })
                continue
            ok, status, body = check(client, base, path, method, expected, auth)
            if not ok:
                failures += 1
            results.append({
                "path": path, "label": label, "method": method,
                "status": status, "expected": expected,
                "ok": ok, "auth_required": auth,
                "body": body,
            })

    if args.json:
        print(json.dumps({
            "base_url": base,
            "checked_at": int(time.time()),
            "failures": failures,
            "results": results,
        }, indent=2))
    else:
        print(color(f"\nSmoke test: {base}\n", "cyan"))
        print(f"{'STATUS':<10} {'METHOD':<6} {'PATH':<40} {'NOTE'}")
        print("-" * 90)
        for r in results:
            if r.get("status") == "skipped":
                badge = color("SKIP", "yellow")
            elif r["ok"]:
                badge = color("OK", "green")
            else:
                badge = color("FAIL", "red")
            note = r.get("note") or r.get("label") or ""
            print(f"{badge:<10} {r.get('method', ''):<6} "
                  f"{r['path']:<40} {note}")
            if not r["ok"] and r.get("body") is not None:
                snippet = json.dumps(r["body"])[:120] if isinstance(r["body"], (dict, list)) else str(r["body"])[:120]
                print(f"           {color('↳', 'dim')} {snippet}")

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
