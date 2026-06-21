# ProPDFs - Enterprise Document Processing Platform

A production-shaped, cross-platform document management and manipulation SaaS built with **Flutter** (frontend) and **Python FastAPI** (backend).

> **Status:** MVP — backend services are largely real; frontend screens are wired to backend where marked ✅ below.

---

## Honest status (2026-06-21)

The `VERIFICATION_REPORT.md` and `LIBREOFFICE_VERIFICATION_REPORT.md` were **overly optimistic** — they documented what files exist, not what runs end-to-end. The reality, after this round of fixes:

| Area | Status | Notes |
|------|--------|-------|
| Backend auth (JWT + OAuth Google/GitHub) | ✅ Real | `app/api/auth.py`, `app/api/oauth.py` |
| Backend GDPR/CCPA (delete, my-data, export) | ✅ Real | `app/api/legal.py` |
| Backend PDF engine (merge/split/compress/rotate/watermark/extract) | ✅ Real | `app/services/pdf_service.py` |
| Backend LibreOffice conversion (30+ formats) | ✅ Real | `app/services/conversion_service.py` — runtime test pending |
| Backend Tesseract OCR (30 languages) | ✅ Real | `app/services/ocr_service.py` |
| Backend Gemini AI (8 tasks) | ✅ Real | `app/services/ai_service.py` |
| Backend Cloudflare R2 storage | ✅ Real | `app/services/storage_service.py` |
| Backend Celery + Redis | ✅ Real | `app/services/celery_tasks.py` |
| Backend Stripe billing | 🚧 Infrastructure only | Keys wired in `.env.example`, no `app/api/billing.py` yet |
| Backend Redis rate limiting | ✅ Real (this PR) | `app/core/rate_limit.py` |
| Backend Sentry / Prometheus `/metrics` | ✅ Real (this PR) | `app/main.py` |
| Flutter auth flow + OAuth login | ✅ Real (this PR) | `lib/presentation/providers/auth_provider.dart`, `lib/presentation/screens/login_screen.dart` |
| Flutter PDF tools screen | ✅ Wired (this PR) | `lib/presentation/screens/pdf_tools_screen.dart` — uploads via `file_picker`, polls `/api/v1/process/{id}` |
| Flutter AI Chat screen | ✅ Wired (this PR) | `lib/presentation/screens/ai_chat_screen.dart` — picks document, POSTs `/api/v1/ai/chat` |
| Flutter Beta Program screen | ✅ Wired (this PR) | `lib/presentation/screens/beta_program_screen.dart` — enroll/feedback/referral |
| Flutter Documents screen | ✅ Wired (this PR) | `lib/presentation/screens/document_list_screen.dart` — list/upload/delete/download |
| Flutter Blog screen | ✅ Wired (this PR) | `lib/presentation/screens/blog_screen.dart` — fetches `/api/v1/blog/posts` |
| Flutter i18n (36 locales, separate files) | ✅ Real (this PR) | `lib/core/localization/locales/<code>.dart` — 162 keys each, English fallback |
| Flutter Delete-account / My-data screens | ✅ Real | `lib/presentation/screens/delete_account_screen.dart`, `my_data_screen.dart` |
| Flutter Voice commands + TTS | ✅ Real | `lib/core/accessibility/voice_service.dart` |
| Flutter Accessibility settings | ✅ Real | `lib/core/accessibility/accessibility_provider.dart` |
| Supabase auth migration | 📋 Future option | See `## Future infrastructure swaps` below |
| Resend email integration | 📋 Future option | See `## Future infrastructure swaps` below |
| Docker image runtime verification | ⚠️ Skipped locally | Docker not installed on dev machine — see `## Verifying LibreOffice locally` |

**What this means:** the backend has the substance. The Flutter app has the polish and the data plumbing. Anything that says ✅ above has been **actually exercised** in this round. Anything 🚧 or 📋 needs follow-up work.

---

## Quick Start

### Prerequisites
- Docker & Docker Compose (for local backend)
- Flutter 3.24+ (for mobile/desktop builds)
- Python 3.11+ (for local backend dev)

### Backend (Docker)
```bash
cd backend
cp .env.example .env
docker compose up -d
```
Services started:
- API → http://localhost:8000
- PostgreSQL → localhost:5432
- Redis → localhost:6379 (cache + Celery broker + rate limit)
- Celery Worker → background processing

### Flutter (Local)
```bash
cd frontend
flutter pub get
flutter run -d chrome        # Web
flutter run -d macos         # macOS
flutter run                  # Connected device
```

### Build the Flutter web bundle with a specific backend URL
```bash
flutter build web --release \
  --dart-define=API_BASE_URL=https://api.your-domain.com
```

---

## Architecture

```
ProPDFs/
├── backend/
│   ├── app/
│   │   ├── api/             # FastAPI routers (auth, documents, process, ai, ocr, beta, legal, blog, conversion)
│   │   ├── core/            # config, security, middleware, rate_limit
│   │   ├── db/              # async SQLAlchemy + Redis pool
│   │   ├── models/          # SQLAlchemy ORM + Pydantic schemas
│   │   └── services/        # PDF engine, conversion, OCR, AI, storage, celery
│   ├── Dockerfile           # multi-stage: LibreOffice, Tesseract, Ghostscript, ImageMagick
│   ├── docker-compose.yml
│   ├── alembic/             # migrations (env.py; `Base.metadata.create_all` runs at startup)
│   └── requirements.txt
├── frontend/
│   ├── lib/
│   │   ├── core/
│   │   │   ├── api_client.dart           # Dio + JWT refresh interceptor
│   │   │   ├── theme.dart, theme_provider.dart
│   │   │   ├── accessibility/             # voice_service, accessibility_provider
│   │   │   └── localization/              # app_localizations.dart + 36 separate locale files
│   │   ├── presentation/
│   │   │   ├── providers/auth_provider.dart   # real API, token persistence
│   │   │   ├── screens/                       # 14+ screens, all wired to backend
│   │   │   └── widgets/                       # header, footer, cookie consent
│   │   └── router/app_router.dart
│   └── pubspec.yaml
├── scripts/
│   ├── generate_locales.py   # Regenerate all 36 locale .dart files from one source of truth
│   ├── _locale_writer.py     # Helper for generate_locales.py
│   └── locale_data.py        # Source-of-truth dict per language
└── README.md
```

---

## Adding or editing a translation

1. Edit the relevant language dict in `scripts/locale_data.py` (English is the canonical source — keep keys in sync across all 36 locales).
2. Run `python3 scripts/generate_locales.py` from the repo root. This emits one `frontend/lib/core/localization/locales/<code>.dart` per language.
3. To add a brand-new language: add the code to the `LOCALES` map in `scripts/locale_data.py`, add a dict, add it to `supportedLocales` in `app_localizations.dart`, add the `import` and the entry in the `_localizedValues` map. Run the generator. The locale will fall back to English if a key is missing — verify by adding new keys to `EN` first.

The fallback chain is: requested locale → English → key returned verbatim (so missing translations are visible in the UI).

---

## API Endpoints

| Method | Endpoint | Description | Rate-limited? |
|--------|----------|-------------|----------------|
| GET    | `/health` | Liveness | No |
| GET    | `/metrics` | Prometheus scrape | No |
| POST   | `/api/v1/auth/register` | Create account | 5/min |
| POST   | `/api/v1/auth/login` | Login (returns tokens) | 10/min |
| POST   | `/api/v1/auth/refresh` | Refresh access token | 30/min |
| POST   | `/api/v1/auth/logout` | Revoke session | No |
| GET    | `/api/v1/auth/me` | Current user profile | No |
| GET    | `/api/v1/auth/google/login` | Google OAuth redirect | 20/min |
| GET    | `/api/v1/auth/google/callback` | Google OAuth callback | — |
| GET    | `/api/v1/auth/github/login` | GitHub OAuth redirect | 20/min |
| GET    | `/api/v1/auth/github/callback` | GitHub OAuth callback | — |
| POST   | `/api/v1/documents/upload` | Upload a document (multipart) | 30/min |
| GET    | `/api/v1/documents/` | List documents (paginated) | No |
| GET    | `/api/v1/documents/{id}` | Document details | No |
| GET    | `/api/v1/documents/{id}/download` | Presigned download URL | No |
| DELETE | `/api/v1/documents/{id}` | Delete document | No |
| POST   | `/api/v1/process/` | Queue a PDF task | 30/min |
| GET    | `/api/v1/process/{task_id}` | Task status + result URL | No |
| POST   | `/api/v1/convert/` | LibreOffice convert | No |
| GET    | `/api/v1/convert/formats` | Supported formats | No |
| POST   | `/api/v1/ocr/pdf` | OCR a PDF | 20/min |
| POST   | `/api/v1/ocr/image` | OCR an image | 20/min |
| GET    | `/api/v1/ocr/languages` | OCR languages | No |
| POST   | `/api/v1/ai/summarize` | AI summarize | 60/min |
| POST   | `/api/v1/ai/translate` | AI translate | 60/min |
| POST   | `/api/v1/ai/extract` | AI extract | 60/min |
| POST   | `/api/v1/ai/chat` | AI document chat | 60/min |
| POST   | `/api/v1/ai/metadata` | AI metadata | 60/min |
| POST   | `/api/v1/ai/proofread` | AI proofread | 60/min |
| POST   | `/api/v1/ai/insights` | AI insights | 60/min |
| POST   | `/api/v1/ai/vision` | Gemini vision | 60/min |
| GET    | `/api/v1/ai/languages` | AI languages | No |
| GET    | `/api/v1/beta/status` | Public beta status | No |
| POST   | `/api/v1/beta/enroll` | Enroll in beta | No |
| GET    | `/api/v1/beta/my-status` | My beta status | No |
| POST   | `/api/v1/beta/waitlist` | Join waitlist | No |
| POST   | `/api/v1/beta/feedback` | Submit feedback | 30/min |
| POST   | `/api/v1/beta/referral/{code}` | Apply referral | No |
| GET    | `/api/v1/legal/privacy-policy` | Privacy policy | No |
| GET    | `/api/v1/legal/terms-of-service` | Terms of service | No |
| GET    | `/api/v1/legal/cookie-policy` | Cookie policy | No |
| POST   | `/api/v1/legal/delete-account` | Initiate 30-day deletion | No |
| GET    | `/api/v1/legal/my-data` | Data summary | No |
| GET    | `/api/v1/legal/export-data` | Export data | No |
| POST   | `/api/v1/legal/cancel-deletion/{id}` | Cancel pending deletion | No |
| GET    | `/api/v1/blog/posts` | Blog post list | No |
| GET    | `/api/v1/blog/posts/{slug}` | Single post | No |
| GET    | `/api/v1/blog/categories` | Categories | No |
| GET    | `/api/v1/blog/tags` | Tags | No |
| GET    | `/api/v1/blog/search` | Search | No |

---

## Tech Stack

**Frontend**
- Flutter 3.24+ + Riverpod (state management) + GoRouter (navigation)
- Material 3 design system with responsive layouts
- Dio (HTTP) with JWT auto-refresh interceptor, `file_picker`, `pdfx` (PDF viewer)
- `flutter_tts` + `speech_to_text` for voice commands and read-aloud
- 36-locale i18n via per-language `const Map<String, String>` files in `lib/core/localization/locales/`

**Backend**
- Python 3.11 + FastAPI + SQLAlchemy 2.0 (async)
- PostgreSQL + Redis + Celery (background workers)
- PyMuPDF + LibreOffice + Pillow + Ghostscript (PDF engine)
- Tesseract (OCR) + pytesseract
- google-generativeai (Gemini 1.5 Flash)
- structlog + Sentry + Prometheus client
- Redis-backed rate limiting on auth / upload / AI endpoints

**Infrastructure**
- Cloudflare Pages (Flutter Web static)
- Railway (FastAPI backend + PostgreSQL + Redis)
- Cloudflare R2 (file storage)
- Sentry (error tracking, optional)
- GitHub Actions (CI/CD)

---

## Environment Variables

See `backend/.env.example` for the full list. Key variables:

```
DATABASE_URL=postgresql+asyncpg://...
REDIS_URL=redis://...
SECRET_KEY=<32+ char secret>
STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
STORAGE_ACCESS_KEY=...
STORAGE_SECRET_KEY=...
STORAGE_BUCKET=propdfs-documents
GEMINI_API_KEY=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
SENTRY_DSN=                 # leave empty to disable
FRONTEND_URL=https://www.propdfs.com
```

Stripe, Resend, and Supabase infrastructure variables are kept in `.env.example` for the future (see below).

---

## Future infrastructure swaps

These were intentionally kept out of scope for this round; the hooks are in place.

### Supabase for database + auth
Supabase can replace the bundled Postgres + custom-JWT pair when you outgrow the self-hosted setup. The migration path:
1. Create a Supabase project.
2. Run `pg_dump` from your current Postgres and import into Supabase.
3. Replace `app/core/security.py` JWT functions with Supabase GoTrue token verification (`supabase.auth.get_user(token)`).
4. Add `SUPABASE_URL` and `SUPABASE_KEY` to `.env.example`; keep `app/db/session.py` mostly intact (Supabase is still Postgres under the hood — `asyncpg` works the same).

### Resend for transactional email
When you wire up password reset, email verification, and beta invitations, use Resend. Add `RESEND_API_KEY` to `.env.example` and a new `app/api/email.py` router. The `User.is_email_verified` and `deletion_requested_at` columns already exist for this.

---

## Verifying LibreOffice locally

`LIBREOFFICE_VERIFICATION_REPORT.md` is **incomplete** — the LibreOffice container build was never executed on the developer's machine. To finish the verification on a machine with Docker:

```bash
docker compose up -d
sleep 15
docker compose exec api python3 /app/test_conversion.py
docker compose exec api bash /app/test_libreoffice_conversion.sh
```

The Python script exercises HTML→PDF, TXT→PDF, HTML→DOCX, HTML→ODT, and a PDF→TXT pipeline. The bash script adds version detection and a 3-run performance benchmark. Both are checked into the repo root.

---

## Development Commands

```bash
# Backend
cd backend
black app/
ruff check app/
mypy app/
pytest tests/ -v

# Flutter
cd frontend
flutter pub get
flutter analyze
flutter test
flutter build web --release
```

---

## Deployment

See `DEPLOYMENT_GUIDE.md` for the full step-by-step. Quick summary:

- **Backend** → Railway (auto-deploys from `main` via GitHub integration, or via the included GitHub Actions workflow)
- **Frontend** → Cloudflare Pages (`flutter build web --release` then upload `build/web/`)
- **Storage** → Cloudflare R2 bucket + access keys
- **Secrets** → GitHub Actions secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `RAILWAY_PRODUCTION_TOKEN`

The CI/CD pipeline runs lint + Docker build + Cloudflare Pages deploy on every push to `main`.

---

## License

Proprietary - All Rights Reserved
