# PropPDFs

A full-stack starter template for **www.propdfs.com** — deployed on **Cloudflare Pages** (frontend) + **Railway** (backend API) + **Supabase** (database & authentication).

---

## Architecture Overview

| Platform | Responsibility | Why |
|----------|---------------|-----|
| **Cloudflare** | DNS, SSL, CDN | Your domain www.propdfs.com is registered here. Cloudflare also provides fast global CDN. |
| **Cloudflare Pages** | Frontend (React app) | Hosts your static website + serverless edge functions. Free, fast, and integrated with Cloudflare DNS. |
| **Railway** | Backend API (Node.js/Express) | Hosts your server-side code that needs a real server (not just static files). Easy deploy from GitHub. |
| **Supabase** | Database + Authentication | Managed PostgreSQL + ready-to-use Auth system. One dashboard for both. Free tier included. |

---

## What Goes Where

### Cloudflare Pages → Frontend Only
- React + Vite static website
- User interface (login, dashboard, forms)
- Calls the Railway backend API for data
- Uses Supabase Auth client for login/signup

### Railway → Backend API Only
- Express.js REST API
- Business logic, file processing, integrations
- Connects to Supabase PostgreSQL for data
- Protected routes verify Supabase JWT tokens

### Supabase → Database + Auth
- **Database**: PostgreSQL (documents, users, properties tables)
- **Auth**: User registration, login, email confirmation, password reset, JWT sessions
- **Storage**: File uploads (PDFs) if needed
- **Row Level Security (RLS)**: Database-level permission rules

---

## Quick Start (Local Development)

### Prerequisites
- Node.js 18+ installed
- A Supabase account (free at https://supabase.com)
- A Railway account (free at https://railway.app)
- A Cloudflare account (you already have one for your domain)

### 1. Clone & Setup
```bash
git clone https://github.com/salimemp/propdfs.git
cd propdfs
```

### 2. Supabase Setup (Database + Auth)
1. Go to https://supabase.com and create a new project
2. Go to **Project Settings → API** — copy `Project URL` and `anon public` key
3. Go to **Database → Connection String** — copy the PostgreSQL connection string (for backend)
4. Go to **Authentication → Providers** — enable **Email** provider
5. Run the migration in `supabase/migrations/001_initial.sql` via the SQL Editor

### 3. Backend Setup
```bash
cd backend
cp .env.example .env
# Edit .env with your Supabase credentials
npm install
npm run dev
# Backend runs on http://localhost:3001
```

### 4. Frontend Setup
```bash
cd frontend
cp .env.example .env
# Edit .env with your Supabase anon key and backend URL
npm install
npm run dev
# Frontend runs on http://localhost:5173
```

---

## Deployment

See `DEPLOYMENT_GUIDE.md` for detailed step-by-step instructions for each platform.

---

## Project Structure

```
propdfs/
├── frontend/          # React + Vite → Cloudflare Pages
├── backend/           # Express.js → Railway
├── supabase/          # Migrations & schema
├── docs/              # Extra documentation
├── DEPLOYMENT_GUIDE.md
└── README.md
```

---

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS
- **Backend**: Express.js, TypeScript, CORS, Helmet
- **Database**: PostgreSQL via Supabase
- **Auth**: Supabase Auth (JWT-based)
- **Deployment**: Cloudflare Pages + Railway

---

## License

MIT
