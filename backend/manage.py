#!/usr/bin/env python3
"""CLI tool for managing the ProPDFs backend."""

import click
import uvicorn


@click.group()
def cli():
    """ProPDFs backend management CLI."""
    pass


@cli.command()
@click.option("--host", default="0.0.0.0", help="Bind host")
@click.option("--port", default=8000, help="Bind port")
@click.option("--reload", is_flag=True, help="Enable auto-reload")
def serve(host, port, reload):
    """Start the API server."""
    uvicorn.run("app.main:app", host=host, port=port, reload=reload)


@cli.command()
def init_db():
    """Initialize the database."""
    import asyncio
    from app.db.session import engine
    from app.models.database import Base

    async def init():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print("✅ Database initialized successfully")

    asyncio.run(init())


@cli.command()
@click.argument("email")
@click.argument("password")
@click.option("--admin", is_flag=True, help="Make user an admin")
def create_user(email, password, admin):
    """Create a new user."""
    import asyncio
    from app.db.session import AsyncSessionLocal
    from app.models.database import User, UserStatus, PlanTier
    from app.core.security import hash_password

    async def create():
        async with AsyncSessionLocal() as db:
            user = User(
                email=email.lower(),
                password_hash=hash_password(password),
                status=UserStatus.ACTIVE,
                plan_tier=PlanTier.PRO if admin else PlanTier.FREE,
            )
            db.add(user)
            await db.commit()
            print(f"✅ User created: {email} (plan: {user.plan_tier.value})")

    asyncio.run(create())


@cli.command()
def worker():
    """Start Celery worker."""
    from app.services.celery_tasks import celery_app
    celery_app.worker_main(argv=["worker", "--loglevel=info", "--concurrency=2"])


if __name__ == "__main__":
    cli()
