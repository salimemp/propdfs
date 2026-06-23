#!/usr/bin/env python3
"""
Bootstrap an admin user for ProPDFs.

Flow:
  1. Register a new user via `POST /auth/register` (or skip if you already
     have a user you want to promote).
  2. Promote them to admin via a direct DB UPDATE — the API doesn't
     expose "set is_admin" yet (intentional: nobody should be able to
     self-promote via the public API).
  3. Print the user's id so you can verify.

The DB update uses the same SQLAlchemy connection string the backend
uses, so it MUST run from a machine that can reach the database. For
local dev that's `localhost:5432`; for production it's whatever the
`DATABASE_URL` env var points at (the same one Railway uses).

Usage:
    DATABASE_URL=postgresql+asyncpg://... \\
        ADMIN_EMAIL=admin@propdfs.com \\
        ADMIN_PASSWORD=<strong-password> \\
        python scripts/create_admin.py

    # Or just register without DB access (you'll need to run the SQL
    # manually):
    PROPDFS_API=https://api.propdfs.com/api/v1 \\
        ADMIN_EMAIL=admin@propdfs.com \\
        ADMIN_PASSWORD=<strong-password> \\
        python scripts/create_admin.py --register-only
"""
import argparse
import asyncio
import os
import sys
from pathlib import Path

import httpx


PROPDFS_API = os.environ.get("PROPDFS_API", "https://api.propdfs.com/api/v1")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")
ADMIN_NAME = os.environ.get("ADMIN_NAME", "ProPDFs Admin")
DATABASE_URL = os.environ.get("DATABASE_URL")


def _ensure_creds() -> tuple[str, str]:
    if not ADMIN_EMAIL or not ADMIN_PASSWORD:
        print("Set ADMIN_EMAIL and ADMIN_PASSWORD in the environment.", file=sys.stderr)
        sys.exit(2)
    return ADMIN_EMAIL, ADMIN_PASSWORD


async def register_user() -> str:
    """Register via the public API. Returns the new user id, or the
    existing id if the email is already registered."""
    email, password = _ensure_creds()
    async with httpx.AsyncClient(timeout=15.0) as c:
        # Try register; if it 400s because the email already exists,
        # fall through to login.
        r = await c.post(f"{PROPDFS_API}/auth/register", json={
            "email": email,
            "password": password,
            "full_name": ADMIN_NAME,
        })
        if r.status_code in (200, 201):
            return r.json()["user"]["id"]

        # Already registered — log in to discover the id.
        if r.status_code == 400 and "already registered" in r.text:
            r = await c.post(f"{PROPDFS_API}/auth/login", json={
                "email": email,
                "password": password,
            })
            r.raise_for_status()
            access = r.json()["access_token"]
            r = await c.get(
                f"{PROPDFS_API}/auth/me",
                headers={"Authorization": f"Bearer {access}"},
            )
            r.raise_for_status()
            return r.json()["id"]

        r.raise_for_status()
        return ""  # unreachable


def promote_in_db(user_id: str) -> None:
    """Direct DB update to flip is_admin=True. Skipped when
    --register-only."""
    if not DATABASE_URL:
        print(
            "DATABASE_URL not set — skipping DB promotion.\n"
            f"Run this SQL manually against your DB:\n\n"
            f"    UPDATE users SET is_admin = TRUE WHERE id = '{user_id}';\n",
            file=sys.stderr,
        )
        return

    # We use the synchronous driver so this works in a plain script
    # (no asyncio loop required for this part).
    from sqlalchemy import create_engine, text

    # SQLAlchemy accepts both asyncpg and psycopg URLs; for a one-off
    # script the sync driver is simpler.
    url = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://", 1)
    engine = create_engine(url)
    with engine.begin() as conn:
        result = conn.execute(
            text("UPDATE users SET is_admin = TRUE WHERE id = :uid RETURNING id, email"),
            {"uid": user_id},
        )
        row = result.fetchone()
        if row is None:
            print(f"No user found with id={user_id} — nothing updated.")
            sys.exit(1)
        print(f"✓ Promoted {row.email} (id={row.id}) to admin.")


async def main() -> int:
    p = argparse.ArgumentParser(description="Bootstrap a ProPDFs admin user.")
    p.add_argument(
        "--register-only",
        action="store_true",
        help="Skip the DB UPDATE — register the user and print the SQL to run manually.",
    )
    args = p.parse_args()

    print(f"→ Registering/logging in {ADMIN_EMAIL} …")
    user_id = await register_user()
    print(f"  user_id = {user_id}")

    if args.register_only:
        print("\nRun this SQL against your prod DB to promote them:")
        print(f"    UPDATE users SET is_admin = TRUE WHERE id = '{user_id}';")
        return 0

    promote_in_db(user_id)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
