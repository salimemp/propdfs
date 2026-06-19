# ProPDFs - Deployment Guide

## Architecture

| Platform | Service | Stack |
|----------|---------|-------|
| **Cloudflare Pages** | Flutter Web (Static) | Flutter 3.x → build/web |
| **Railway** | Backend API | Python 3.11 + FastAPI + Docker |
| **Railway** | PostgreSQL | Managed PostgreSQL add-on |
| **Railway** | Redis | Managed Redis add-on (for Celery) |
| **Cloudflare R2** | File Storage | PDFs, documents, images |

---

## Prerequisites

1. [Railway](https://railway.app) account
2. [Cloudflare](https://cloudflare.com) account (with Pages + R2)
3. [GitHub](https://github.com) repository connected to Railway & Cloudflare Pages
4. [Supabase](https://supabase.com) or Firebase project (for Auth — optional if using custom JWT)

---

## 1. Backend (FastAPI) → Railway

### 1.1 Create Railway Project

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click **New Project** → **Deploy from GitHub repo**
3. Select `salimemp/propdfs`
4. Add a **New Service** → **Dockerfile**
5. Set the service root to `./backend` (Railway will detect `backend/Dockerfile`)
6. Rename the service to `backend`

### 1.2 Add PostgreSQL

1. Click **New** → **Database** → **Add PostgreSQL**
2. Railway will create a managed PostgreSQL and inject the `DATABASE_URL` env variable automatically

### 1.3 Add Redis

1. Click **New** → **Database** → **Add Redis**
2. Railway will create a managed Redis and inject the `REDIS_URL` env variable automatically

### 1.4 Environment Variables

Go to the `backend` service → **Variables** tab and add these:

| Variable | Value | Source |
|----------|-------|--------|
| `DATABASE_URL` | Auto-populated by Railway PostgreSQL | Railway |
| `REDIS_URL` | Auto-populated by Railway Redis | Railway |
| `CELERY_BROKER_URL` | Same as `REDIS_URL` | Copy from Redis |
| `CELERY_RESULT_BACKEND` | Same as `REDIS_URL` | Copy from Redis |
| `SECRET_KEY` | Generate: `openssl rand -hex 32` | Manual |
| `ENVIRONMENT` | `production` | Manual |
| `DEBUG` | `false` | Manual |
| `FRONTEND_URL` | `https://www.propdfs.com` | Your domain |
| `STORAGE_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` | Cloudflare R2 |
| `STORAGE_ACCESS_KEY` | Your R2 access key | Cloudflare R2 |
| `STORAGE_SECRET_KEY` | Your R2 secret key | Cloudflare R2 |
| `STORAGE_BUCKET` | `propdfs-documents` | Manual |
| `STORAGE_REGION` | `auto` | Manual |
| `MAX_FILE_SIZE_MB` | `500` | Manual |
| `STRIPE_SECRET_KEY` | `sk_live_...` | Stripe |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Stripe |
| `OPENAI_API_KEY` | `sk-...` | OpenAI |
| `GOOGLE_CLIENT_ID` | `...` | Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | `...` | Google Cloud Console |
| `GITHUB_CLIENT_ID` | `...` | GitHub OAuth Apps |
| `GITHUB_CLIENT_SECRET` | `...` | GitHub OAuth Apps |

### 1.5 Deploy

1. Click **Deploy** on the `backend` service
2. Railway will build the Dockerfile and deploy
3. Copy the deployed URL: `https://backend-<project>.up.railway.app`
4. Test the health endpoint: `https://backend-<project>.up.railway.app/health`

### 1.6 Database Migrations

Run migrations manually after first deploy:

```bash
railway login
railway connect
# In the shell
cd backend
alembic upgrade head
```

Or use Railway's CLI to run a one-off command:

```bash
railway run --service backend "alembic upgrade head"
```

---

## 2. Frontend (Flutter Web) → Cloudflare Pages

### 2.1 Build Flutter Web Locally

```bash
cd frontend
flutter pub get
flutter build web --release
```

This creates static files in `frontend/build/web/`.

### 2.2 Deploy to Cloudflare Pages

#### Option A: Wrangler CLI (Recommended)

```bash
# Install wrangler
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Deploy
wrangler pages deploy frontend/build/web --project-name=propdfs
```

#### Option B: GitHub Actions (Auto-deploy on push)

The CI/CD pipeline (`.github/workflows/ci-cd.yml`) already includes this.

Set these GitHub secrets:
- `CLOUDFLARE_API_TOKEN` — Create at Cloudflare → My Profile → API Tokens → Create Token (use "Edit Cloudflare Workers" template)
- `CLOUDFLARE_ACCOUNT_ID` — Found on the right side of your Cloudflare dashboard
- `RAILWAY_PRODUCTION_TOKEN` — Create at Railway → Account Settings → Tokens

Push to `main` and the workflow will auto-deploy.

#### Option C: Cloudflare Dashboard (Drag & Drop)

1. Go to [Cloudflare Pages](https://dash.cloudflare.com/pages)
2. Create a new project
3. Upload `frontend/build/web` as a folder

### 2.3 Custom Domain

1. In Cloudflare Pages → **Custom Domains**
2. Add `www.propdfs.com`
3. Add DNS CNAME record in Cloudflare DNS pointing to your Pages domain

---

## 3. Database (PostgreSQL) → Railway

Railway's PostgreSQL add-on is fully managed. The `DATABASE_URL` is automatically injected.

### Backup Strategy

Railway provides automatic daily backups. You can also export manually:

```bash
railway connect --service postgres
pg_dump $DATABASE_URL > backup.sql
```

---

## 4. Redis (Celery) → Railway

Railway's Redis add-on is used for Celery task queue and result backend.

The `REDIS_URL`, `CELERY_BROKER_URL`, and `CELERY_RESULT_BACKEND` should all point to the same Redis instance.

### Celery Worker Deployment

The current Dockerfile starts the FastAPI server. For Celery workers, create a separate Railway service:

1. Add a new service from the same repo
2. Set root to `./backend`
3. Override the start command to:
   ```bash
   celery -A app.services.celery_tasks.celery_app worker --loglevel=info --concurrency=2
   ```

Or use Railway's `railway.json` override for the worker service.

---

## 5. File Storage (Cloudflare R2)

1. Go to Cloudflare Dashboard → **R2**
2. Create a bucket named `propdfs-documents`
3. Go to **Manage R2 API Tokens** → Create a new token with Read/Write permissions
4. Copy the Access Key ID and Secret Access Key to Railway env variables

### CORS Policy

Set the R2 bucket CORS to allow your frontend domain:

```json
[
  {
    "AllowedOrigins": ["https://www.propdfs.com"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

---

## 6. Environment Variable Checklist

### Backend (Railway)

```bash
# Required
DATABASE_URL=
REDIS_URL=
SECRET_KEY=
ENVIRONMENT=production
DEBUG=false

# Storage
STORAGE_ENDPOINT=
STORAGE_ACCESS_KEY=
STORAGE_SECRET_KEY=
STORAGE_BUCKET=propdfs-documents
STORAGE_REGION=auto
MAX_FILE_SIZE_MB=500

# Auth (optional — if using custom JWT instead of Firebase)
FRONTEND_URL=https://www.propdfs.com

# Payments (optional)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_PRO=
STRIPE_PRICE_BUSINESS=

# AI (optional)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=

# OAuth (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

### Frontend (Flutter Web — Build-time .env)

```bash
# For local development, create frontend/.env
# For production, these are compiled into the Flutter web build
# You must rebuild and redeploy when these change

API_BASE_URL=https://backend-<project>.up.railway.app
FIREBASE_API_KEY=...
FIREBASE_APP_ID=...
FIREBASE_PROJECT_ID=...
```

---

## 7. CI/CD Secrets (GitHub)

Go to GitHub → Repository → Settings → Secrets and variables → Actions → New repository secret:

| Secret | How to Get |
|--------|-----------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare Dashboard → My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard → right sidebar |
| `RAILWAY_PRODUCTION_TOKEN` | Railway → Account Settings → Tokens → New Token |
| `RAILWAY_STAGING_TOKEN` | Railway → Account Settings → Tokens → New Token (for staging env) |

---

## 8. First Deploy Checklist

- [ ] Railway project created with GitHub repo
- [ ] PostgreSQL add-on added
- [ ] Redis add-on added
- [ ] Backend service deployed successfully
- [ ] Health check endpoint responds (`/health`)
- [ ] Database migrations ran (`alembic upgrade head`)
- [ ] Cloudflare R2 bucket created with API keys
- [ ] Cloudflare Pages project created with Flutter build
- [ ] Custom domain `www.propdfs.com` configured
- [ ] Environment variables set on Railway
- [ ] GitHub Actions secrets configured
- [ ] Push to `main` triggers CI/CD and auto-deploys

---

## 9. Local Development (unchanged)

```bash
# 1. Clone
git clone https://github.com/salimemp/propdfs.git
cd propdfs

# 2. Setup backend
cd backend
cp .env.example .env
# Edit .env with your credentials
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 3. Setup frontend
cd ../frontend
flutter pub get

# 4. Start infrastructure (PostgreSQL + Redis)
cd ..
docker compose up -d

# 5. Start backend
cd backend
uvicorn app.main:app --reload --port 8000

# 6. Start frontend (new terminal)
cd frontend
flutter run -d chrome
```

---

## 10. Troubleshooting

### Railway backend fails to start

- Check `PORT` env var is set (Railway sets it automatically)
- Check Dockerfile CMD uses `${PORT:-8000}` (already fixed in repo)
- Check `DATABASE_URL` is correctly populated by Railway PostgreSQL

### Cloudflare Pages build fails

- Ensure Flutter SDK is available during build (CI/CD installs it)
- Check `frontend/build/web` exists before deploying
- If using Wrangler, ensure you're logged in: `wrangler login`

### Database connection errors

- Verify `DATABASE_URL` format: `postgresql+asyncpg://...`
- Check Railway PostgreSQL is in the same project/region as the backend
- Test connection: `railway connect --service postgres`

### File uploads fail

- Verify R2 credentials in Railway env vars
- Check R2 bucket CORS allows your frontend domain
- Verify `MAX_FILE_SIZE_MB` is set high enough

---

## License

Proprietary - All Rights Reserved
