# ProPDFs - Enterprise Document Processing Platform

A production-grade, cross-platform document management and manipulation SaaS built with **Flutter** (frontend) and **Python FastAPI** (backend).

> **Status:** MVP Phase 1 Active Development
> **Platforms:** Web, Android, iOS, Windows, macOS, Linux

---

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Flutter 3.24+ (for mobile/desktop builds)
- Python 3.11+ (for local backend development)

### Backend (Docker)
```bash
cd backend
cp .env.example .env
docker compose up -d
```
Services started:
- API → http://localhost:8000
- PostgreSQL → localhost:5432
- Redis → localhost:6379
- Celery Worker → background processing

### Flutter (Local)
```bash
cd frontend
flutter pub get
flutter run -d chrome        # Web
flutter run -d macos         # macOS
flutter run                  # Connected device
```

---

## Architecture

```
ProPDFs/
├── backend/
│   ├── app/
│   │   ├── api/           # FastAPI routers (auth, documents, process)
│   │   ├── core/          # Config, security, exceptions
│   │   ├── db/            # Database session & connection
│   │   ├── models/        # SQLAlchemy ORM + Pydantic schemas
│   │   └── services/      # PDF engine, storage, Celery tasks
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── requirements.txt
├── frontend/
│   ├── lib/
│   │   ├── core/          # Theme, API client, constants
│   │   ├── router/        # GoRouter navigation
│   │   └── presentation/  # Screens, widgets, providers
│   └── pubspec.yaml
└── ROADMAP.md
```

---

## Features (MVP)

| Feature | Status | Description |
|---------|--------|-------------|
| Auth (JWT) | ✅ | Register, login, logout, refresh tokens |
| File Upload | ✅ | Chunked uploads to Cloudflare R2 |
| Merge PDFs | ✅ | Combine multiple PDFs into one |
| Split PDFs | ✅ | Extract pages by range |
| Compress PDFs | ✅ | Reduce file size with image optimization |
| Rotate PDFs | ✅ | 90°/180°/270° rotation |
| Watermark | ✅ | Add text overlay |
| Convert to Images | ✅ | PDF → PNG/JPG |
| Document Manager | ✅ | List, download, delete files |
| Material 3 UI | ✅ | Responsive, dark/light mode |

## Phase 2+ (Pro & Enterprise)
- Google/GitHub OAuth, Passkeys, MFA
- Advanced editing (text, images, redaction)
- OCR with Tesseract
- AI features (summarize, translate, extract)
- Cloud storage integrations (Drive, Dropbox, OneDrive)
- Team workspaces & RBAC
- Stripe billing & subscriptions
- API keys for developers

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | Create account |
| POST | `/api/v1/auth/login` | Get tokens |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| POST | `/api/v1/auth/logout` | Revoke session |
| GET | `/api/v1/auth/me` | Current user profile |
| POST | `/api/v1/documents/upload` | Upload a document |
| GET | `/api/v1/documents/` | List documents |
| GET | `/api/v1/documents/{id}` | Get document details |
| GET | `/api/v1/documents/{id}/download` | Generate download URL |
| DELETE | `/api/v1/documents/{id}` | Delete document |
| POST | `/api/v1/process/` | Queue PDF processing task |
| GET | `/api/v1/process/{task_id}` | Check task status |

---

## Tech Stack

**Frontend**
- Flutter 3.x + Riverpod (state management) + GoRouter (navigation)
- Material 3 design system with responsive layouts
- dio (HTTP), file_picker, pdfx (PDF viewer)

**Backend**
- Python 3.11 + FastAPI + SQLAlchemy 2.0 (async)
- PostgreSQL + Redis + Celery (background workers)
- PyMuPDF + LibreOffice + Pillow + Ghostscript (PDF engine)
- JWT auth + bcrypt + OAuth2-ready architecture

**Infrastructure**
- Docker + Docker Compose (development)
- Cloudflare R2 (document storage) + CDN
- Cloudflare Pages (Flutter Web) + Railway (FastAPI backend)

---

## Environment Variables

See `backend/.env.example` for all configuration options.

Key variables:
- `DATABASE_URL` — PostgreSQL connection string
- `SECRET_KEY` — JWT signing key (32+ chars)
- `STORAGE_*` — S3/R2 credentials for file storage
- `STRIPE_*` — Payment processing keys
- `OPENAI_API_KEY` — AI feature integration

---

## Development Commands

```bash
# Backend lint & format
cd backend
black app/
ruff check app/
mypy app/

# Run tests
pytest tests/ -v

# Database migration (Alembic)
alembic revision --autogenerate -m "migration name"
alembic upgrade head

# Flutter build
flutter build web --release
flutter build apk --release
flutter build ios --release
```

---

## Deployment

See `DEPLOYMENT_GUIDE.md` for step-by-step deployment instructions for:
- Railway (FastAPI backend + PostgreSQL + Redis)
- Cloudflare Pages (Flutter Web)
- Cloudflare R2 (File storage)
- GitHub Actions (CI/CD)

---

## License

Proprietary - All Rights Reserved

## Contact

For support or enterprise inquiries, contact the development team.
