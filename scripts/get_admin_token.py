#!/usr/bin/env python3
"""
Generate the `PROPDFS_ADMIN_TOKEN` GitHub secret used by the harborseo
auto-publishing workflow.

The token is a **refresh token** (not the access token). Refresh tokens
last 7 days (see `REFRESH_TOKEN_EXPIRE_DAYS` in `app/core/config.py`).
The workflow calls `/auth/refresh` at the start of each run to mint a
fresh access token (60 min) on the spot, then uses that for the POST.

If you stored the raw access token instead, the workflow would break
the first time the access token expired (60 min after login). With the
refresh token, every workflow run is fresh. For a real production
deployment you want an even longer-lived token (90 days); we'll add a
purpose-built admin-token endpoint in a follow-up.

Usage:
    PROPDFS_API=https://api.propdfs.com/api/v1 \\
        ADMIN_EMAIL=admin@propdfs.com \\
        ADMIN_PASSWORD=<strong-password> \\
        python scripts/get_admin_token.py

The script prints:
  - The exact value to paste into the GitHub Actions secret field
  - A dry-run verification (calls /auth/me to confirm the token works)
  - The expires_in + token_type so you can sanity check

NEVER paste the printed token into chat / Claude Code / the terminal
scrollback where someone might read it. Pipe directly into your
password manager or copy from the GUI:
    python scripts/get_admin_token.py 2>/dev/null | grep '^PROPDFS_ADMIN_TOKEN=' | cut -d= -f2 | pbcopy
"""
import os
import sys
from pathlib import Path

import httpx


PROPDFS_API = os.environ.get("PROPDFS_API", "https://api.propdfs.com/api/v1")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")


def _ensure_creds() -> None:
    if not ADMIN_EMAIL or not ADMIN_PASSWORD:
        print(
            "Set ADMIN_EMAIL and ADMIN_PASSWORD in the environment.\n"
            "Both are needed — we log in to obtain a refresh token.",
            file=sys.stderr,
        )
        sys.exit(2)


def login() -> dict:
    """Hit /auth/login, return the response body."""
    _ensure_creds()
    with httpx.Client(timeout=15.0) as c:
        r = c.post(f"{PROPDFS_API}/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
        })
        if r.status_code == 401:
            print(
                "401 Unauthorized. If you just promoted this user to "
                "admin via the create_admin script, the issue is probably "
                "a wrong password (it sets is_admin, not the password).\n"
                "Double-check ADMIN_PASSWORD.",
                file=sys.stderr,
            )
            sys.exit(1)
        r.raise_for_status()
        return r.json()


def verify(access_token: str) -> dict:
    """Verify the access token actually works AND that the user has
    is_admin=True. Returns the /auth/me body."""
    with httpx.Client(timeout=15.0) as c:
        r = c.get(
            f"{PROPDFS_API}/auth/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        r.raise_for_status()
        return r.json()


def main() -> int:
    print("→ Logging in …")
    body = login()
    access = body["access_token"]
    refresh = body["refresh_token"]

    print("→ Verifying token + admin status …")
    me = verify(access)
    is_admin = bool(me.get("is_admin"))
    email = me.get("email")
    plan = me.get("plan_tier")
    print(f"  email    = {email}")
    print(f"  is_admin = {is_admin}")
    print(f"  plan     = {plan}")
    print(f"  access_token  TTL = {body['expires_in']}s")
    print()

    if not is_admin:
        # Don't bail. The refresh token is valid for 7 days regardless
        # of admin status — admin is only enforced at /blog/posts POST
        # time, which won't happen until the next harborseo publish
        # tick. The operator can flip is_admin=true via the Railway
        # Postgres "Data" tab in the meantime. Hard-failing here
        # would block the workflow from printing the token at all,
        # and the operator would have nothing to save as a secret.
        print(
            "  ⚠️  is_admin is FALSE. The token below is still valid "
            "(refresh tokens last 7 days), but /blog/posts will return "
            "403 until the operator runs:",
            file=sys.stderr,
        )
        print(
            "      UPDATE users SET is_admin = TRUE "
            f"WHERE email = '{email}';",
            file=sys.stderr,
        )
        print(
            "  in Railway → Postgres service → Data tab → New query.",
            file=sys.stderr,
        )
        print()

    print("=" * 60)
    print("PASTE THIS VALUE INTO THE GitHub Actions SECRET NAMED")
    print("`PROPDFS_ADMIN_TOKEN` (DO NOT echo it back to me):")
    print("=" * 60)
    # Print in a copy-paste-friendly form. The leading "PROPDFS_ADMIN_TOKEN="
    # helps if you `eval` it, but mostly it's there so a grep/copy is unambiguous.
    print(f"PROPDFS_ADMIN_TOKEN={refresh}")
    print("=" * 60)
    print()
    print("This is the REFRESH token. It lasts ~7 days and the workflow")
    print("uses /auth/refresh to mint a fresh access token at the start")
    print("of each run. Rotate it before it expires:")
    print("    1. Re-run this script")
    print("    2. Paste the new value into the GitHub secret")
    print("    3. Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
