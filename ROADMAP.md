# ProPDFs - Enterprise Document Processing Platform

> **Last updated:** 2026-06-30

## Completed — Phase 1: MVP

### Sprint 1: Foundation ✅
- [x] Project scaffolding (Flutter + FastAPI)
- [x] Docker & development environment
- [x] Database schema (SQLAlchemy ORM, 10 tables, Alembic migrations)
- [x] PostgreSQL + asyncpg (async driver)
- [x] Core authentication (Email/Password + JWT with JTI-based sessions)
- [x] Session revocation (DB-backed `user_sessions` table)
- [x] Flutter UI shell (Material 3, GoRouter, Riverpod)
- [x] 36-language internationalization (i18n)
- [x] Cookie consent banner
- [x] Privacy Policy, Terms of Service, Accessibility screens

### Sprint 2: Core PDF Engine ✅
- [x] PDF merge service
- [x] PDF split service
- [x] PDF compress service
- [x] PDF rotate, extract pages, watermark
- [x] File upload/download API
- [x] Cloudflare R2 file storage (S3-compatible)
- [x] File management dashboard (document list screen)
- [x] Max file size: 500 MB

### Sprint 3: Conversion & Storage ✅
- [x] DOCX ↔ PDF conversion (LibreOffice headless)
- [x] Image ↔ PDF conversion (PyMuPDF + Pillow)
- [x] PDF ↔ Excel conversion (openpyxl)
- [x] Cloudflare R2 integration (boto3, CORS configured)
- [x] Structured logging (structlog)

### Sprint 4: Polish & Payments ✅
- [x] Stripe subscription integration
- [x] Usage tracking & limits (Redis-backed daily quotas)
- [x] Plan tiers: Free / Pro / Business / Enterprise
- [x] Error handling & logging (structlog + Sentry)
- [x] CI/CD pipeline (GitHub Actions → Railway + Cloudflare Pages)
- [x] SEO + blog automation pipeline (harborseo)

---

## Completed — Phase 2: Pro

- [x] Google OAuth login
- [x] GitHub OAuth login
- [x] Advanced PDF editing (rotate, rearrange, delete pages)
- [x] OCR with Tesseract (dedicated endpoint)
- [x] Watermarks & page numbers
- [x] TOTP 2FA / MFA (pyotp, QR provisioning, backup codes)
- [x] Password breach checking (HIBP k-anonymity API)
- [x] Password strength enforcement (configurable policy)
- [x] Redis-based rate limiting (per-route fixed-window)
- [x] Cloudflare Turnstile bot protection (login/register)
- [x] Blog CMS with admin publishing
- [x] Beta program + feedback collection
- [x] Tool waitlist (coming-soon notification capture)
- [x] GDPR/CCPA account deletion flow
- [x] My Data export screen
- [x] Accessibility settings screen
- [x] Pricing page with plan comparison
- [ ] Mobile app stores (iOS/Android) — *Flutter web-first; mobile build not yet deployed*

---

## In Progress — Phase 3: Enterprise

- [ ] AI features (summarize, translate, extract) — *service layer wired, Gemini integration active, UI shipped*
- [ ] Cloud storage integrations (Drive, Dropbox, OneDrive)
- [ ] Passkey/WebAuthn
- [ ] RBAC & organization accounts
- [ ] API keys for developers
- [ ] SOC2 compliance features
- [ ] Team workspaces

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Flutter 3.x + Riverpod + GoRouter + Material 3 |
| **Backend** | Python 3.11 + FastAPI + PostgreSQL + Redis + Celery |
| **Storage** | Cloudflare R2 (S3-compatible) |
| **Payments** | Stripe (subscriptions + webhooks) |
| **Auth** | JWT + OAuth2 (Google/GitHub) + TOTP 2FA + Turnstile |
| **PDF Engine** | PyMuPDF + LibreOffice headless + Pillow + pikepdf |
| **AI** | Google Gemini API (with OpenAI/Claude integration layer) |
| **Hosting** | Cloudflare Pages (frontend) + Railway (backend + DB + Redis) |
| **CI/CD** | GitHub Actions (lint → test → deploy staging → deploy production) |
| **Monitoring** | Sentry (error tracking) + Prometheus (metrics) + structlog |
