# Deployment Guide for PropPDFs

> **For complete beginners** — step-by-step instructions for each platform.

---

## Table of Contents
1. [Supabase — Database & Authentication](#1-supabase--database--authentication)
2. [Railway — Backend API](#2-railway--backend-api)
3. [Cloudflare Pages — Frontend](#3-cloudflare-pages--frontend)
4. [Cloudflare DNS — Domain Setup](#4-cloudflare-dns--domain-setup)
5. [Connecting Everything Together](#5-connecting-everything-together)

---

## 1. Supabase — Database & Authentication

Supabase handles **both** your database and your user authentication. Think of it as "Firebase but open-source and built on PostgreSQL."

### Step 1: Create a Supabase Project
1. Go to [https://supabase.com](https://supabase.com)
2. Sign up / Log in
3. Click **New Project**
4. Name it: `propdfs`
5. Choose a region close to your users (e.g., `Mumbai` for India, `Singapore` for Asia, `US East` for Americas)
6. Set a database password (save this somewhere safe!)
7. Click **Create new project** (takes 1-2 minutes)

### Step 2: Get Your API Keys
1. Once the project is ready, go to the left sidebar → **Project Settings** → **API**
2. Copy these values (you will need them later):
   - **Project URL** (e.g., `https://xyzabc123.supabase.co`)
   - **anon public** key (starts with `eyJ...`)
   - **service_role secret** key (starts with `eyJ...`) — **never expose this in frontend code!**

### Step 3: Run the Database Migration
1. In Supabase, go to the left sidebar → **SQL Editor**
2. Click **New Query**
3. Open the file `supabase/migrations/001_initial.sql` from this repo
4. Copy the entire SQL contents and paste it into the query editor
5. Click **Run**
6. This creates your tables: `profiles`, `documents`, `properties`

### Step 4: Configure Authentication
1. Go to left sidebar → **Authentication** → **Providers**
2. Make sure **Email** is enabled (it is by default)
3. (Optional) Enable **Google** or **GitHub** login if you want social sign-in
4. Go to **Authentication** → **URL Configuration**
   - Set **Site URL** to: `https://www.propddfs.com` (your production domain)
   - Add `http://localhost:5173` to **Redirect URLs** for local development

### Step 5: Get the Database Connection String (for Backend)
1. Go to **Project Settings** → **Database**
2. Under **Connection String**, select **URI** tab
3. Copy the connection string. It looks like:
   ```
   postgresql://postgres:[password]@db.xyzabc123.supabase.co:5432/postgres
   ```
4. This is what your Railway backend will use to connect to the database

### What Supabase Handles:
- ✅ User sign up / login / logout
- ✅ Password reset emails
- ✅ JWT token generation and validation
- ✅ PostgreSQL database hosting
- ✅ Real-time subscriptions (if needed later)
- ✅ File storage (if you want to store PDFs)

---

## 2. Railway — Backend API

Railway is where your **backend server** lives. It runs your Node.js/Express code 24/7.

### Step 1: Create a Railway Account
1. Go to [https://railway.app](https://railway.app)
2. Sign up with GitHub (recommended) or email
3. You get $5/month free credit (enough for a small app)

### Step 2: Create a New Project
1. Click **New Project**
2. Select **Deploy from GitHub repo**
3. If this is your first time, connect your GitHub account
4. Select the `propdfs` repository
5. Railway will detect the `backend` folder... wait, we need to tell it specifically.

### Step 3: Configure Railway to Deploy the Backend
Railway deploys from the root of the repo by default. We need to tell it to look in the `backend` folder.

1. After selecting the repo, click on the service that was created
2. Go to **Settings** → **Root Directory**
3. Set it to: `backend`
4. Go to **Settings** → **Build Command**
5. Set it to: `npm install && npm run build`
6. Go to **Settings** → **Start Command**
7. Set it to: `npm start`

Alternatively, you can use the Railway CLI or just deploy the `backend` folder directly.

### Step 4: Add Environment Variables
1. In your Railway project dashboard, click on your service
2. Go to the **Variables** tab
3. Add the following variables (use the values from Supabase):

```
NODE_ENV=production
PORT=3000
SUPABASE_URL=https://xyzabc123.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key-here
DATABASE_URL=postgresql://postgres:password@db.xyzabc123.supabase.co:5432/postgres
JWT_SECRET=any-random-secret-string-you-make-up
CORS_ORIGIN=https://www.propdfs.com
```

To generate a `JWT_SECRET`, just type a random long string like:
```
my-super-random-secret-12345-abcdef-67890
```

### Step 5: Deploy
1. Railway will automatically deploy when you push to GitHub
2. Or click **Deploy** in the dashboard
3. Wait for the build to finish (you'll see logs)
4. Once deployed, Railway will give you a URL like:
   ```
   https://propdfs-backend.up.railway.app
   ```
5. **Copy this URL** — you need it for the frontend!

### What Railway Handles:
- ✅ Running your Express.js API server 24/7
- ✅ Server-side business logic (too complex/sensitive for the browser)
- ✅ Connecting to your Supabase database
- ✅ Background jobs or scheduled tasks
- ✅ Environment variables and secrets (kept secure)

---

## 3. Cloudflare Pages — Frontend

Cloudflare Pages hosts your **React website**. It serves your static files from 300+ locations worldwide.

### Step 1: Connect to GitHub
1. Go to [https://dash.cloudflare.com](https://dash.cloudflare.com)
2. Log in with your Cloudflare account
3. In the left sidebar, go to **Pages**
4. Click **Create a project** → **Connect to Git**
5. Select your GitHub account and the `propdfs` repository
6. Click **Begin setup**

### Step 2: Configure Build Settings
1. **Project name**: `propdfs`
2. **Production branch**: `main`
3. **Build command**: `cd frontend && npm install && npm run build`
4. **Build output directory**: `frontend/dist`

(We use `cd frontend` because the frontend code is in a subfolder.)

### Step 3: Add Environment Variables
Before deploying, add these environment variables:

Click **Environment variables (advanced)** and add:
```
VITE_SUPABASE_URL=https://xyzabc123.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key-here
VITE_API_URL=https://propdfs-backend.up.railway.app
```

Use your actual Supabase URL and anon key, and the Railway backend URL you copied earlier.

Click **Save and Deploy**.

### Step 4: Wait for Deployment
- Cloudflare will build your React app and deploy it globally (usually takes 1-2 minutes)
- You'll get a `.pages.dev` URL like: `https://propdfs.pages.dev`

### What Cloudflare Pages Handles:
- ✅ Hosting your React frontend (HTML, CSS, JS)
- ✅ Global CDN (your site loads fast everywhere)
- ✅ Automatic HTTPS (SSL certificate)
- ✅ Automatic deployments on every git push
- ✅ Preview deployments for pull requests
- ✅ (Optional) Serverless edge functions if you add them later

---

## 4. Cloudflare DNS — Domain Setup

You already own `www.propdfs.com` on Cloudflare. Now you need to point it to your Cloudflare Pages site.

### Step 1: Add Custom Domain to Pages
1. In Cloudflare dashboard, go to **Pages** → Select your `propdfs` project
2. Click **Custom domains** tab
3. Click **Set up a custom domain**
4. Enter: `www.propdfs.com`
5. Click **Continue** → **Activate domain**

### Step 2: Verify DNS Record (if needed)
Cloudflare usually creates the DNS record automatically. But to verify:
1. Go to your Cloudflare dashboard → Select your domain `propdfs.com`
2. Go to **DNS** → **Records**
3. You should see a CNAME record:
   - **Type**: CNAME
   - **Name**: `www`
   - **Target**: `propdfs.pages.dev` (or similar)
   - **Proxy status**: 🟡 Orange cloud (Proxied)

If it's not there, add it manually.

### Step 3: Add Redirect (Root Domain → www)
Visitors might type `propdfs.com` (without `www`). You should redirect them to `www.propdfs.com`.

1. In Cloudflare dashboard → **Rules** → **Redirect Rules**
2. Click **Create rule**
3. **Rule name**: `root-to-www`
4. **When incoming requests match**: `Custom filter expression`
   - Field: `Hostname`
   - Operator: `equals`
   - Value: `propdfs.com`
5. **Then**: **URL redirect**
   - Type: `Dynamic`
   - Expression: `concat("https://www.propdfs.com", http.request.uri.path)`
   - Status code: `301`
6. Click **Deploy**

### What Cloudflare DNS Handles:
- ✅ Translating `www.propdfs.com` to Cloudflare Pages
- ✅ SSL/HTTPS certificates (automatic)
- ✅ DDoS protection
- ✅ CDN caching
- ✅ Domain-level redirects

---

## 5. Connecting Everything Together

Here is the data flow after everything is deployed:

```
User types www.propdfs.com
         ↓
   Cloudflare DNS
         ↓
   Cloudflare Pages (React frontend)
         ↓
   User clicks "Login"
         ↓
   Supabase Auth (creates JWT token)
         ↓
   Frontend stores JWT token
         ↓
   User clicks "View Documents"
         ↓
   Frontend calls Railway API:
     GET https://propdfs-backend.up.railway.app/api/documents
     (with JWT token in header)
         ↓
   Railway backend verifies JWT with Supabase
         ↓
   Railway queries Supabase PostgreSQL
         ↓
   Data returns to Frontend → User sees documents
```

### Environment Variables Summary

| Variable | Where it goes | Value | Notes |
|----------|---------------|-------|-------|
| `VITE_SUPABASE_URL` | Cloudflare Pages (build env) | `https://...supabase.co` | Frontend only |
| `VITE_SUPABASE_ANON_KEY` | Cloudflare Pages (build env) | `eyJ...` | Frontend only, public |
| `VITE_API_URL` | Cloudflare Pages (build env) | `https://...railway.app` | Frontend only |
| `SUPABASE_URL` | Railway (runtime env) | `https://...supabase.co` | Backend only |
| `SUPABASE_SERVICE_KEY` | Railway (runtime env) | `eyJ...` | Backend only, secret! |
| `DATABASE_URL` | Railway (runtime env) | `postgresql://...` | Backend only, secret! |
| `JWT_SECRET` | Railway (runtime env) | `your-random-string` | Backend only |
| `CORS_ORIGIN` | Railway (runtime env) | `https://www.propdfs.com` | Backend only |

---

## Troubleshooting for Beginners

### "My Railway backend won't start"
- Check the **Logs** tab in Railway
- Make sure all environment variables are set correctly
- Make sure `DATABASE_URL` is correct and the password is right

### "My frontend can't talk to the backend"
- Check that `VITE_API_URL` in Cloudflare Pages is set to your Railway URL
- Check that `CORS_ORIGIN` in Railway includes your frontend domain (`https://www.propdfs.com`)
- Open browser **Developer Tools** → **Network** tab to see the exact error

### "Login doesn't work"
- Make sure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are correct in Cloudflare Pages
- Check that Supabase Auth is enabled and the email provider is on
- Check that `http://localhost:5173` and `https://www.propdfs.com` are in Supabase Redirect URLs

### "Changes aren't showing up after I push code"
- Cloudflare Pages: Check the **Deployments** tab to see if the build succeeded
- Railway: Check the **Deployments** tab for build errors
- Clear your browser cache (Ctrl+Shift+R or Cmd+Shift+R)

---

## Next Steps After Deployment

1. Set up a custom email sender in Supabase (so emails come from `@propdfs.com` instead of `@supabase.co`)
2. Add file upload functionality using Supabase Storage (for PDFs)
3. Set up a staging environment (separate Supabase project + Railway project for testing)
4. Add monitoring (Railway has built-in logs, or use a service like Sentry)

---

## Architecture Diagram (Text)

```
┌─────────────────────────────────────────────────────────────────────┐
│                           CLOUDFLARE                                 │
│  ┌──────────────────┐         ┌──────────────────┐                 │
│  │   DNS / SSL      │         │   Cloudflare     │                 │
│  │   www.propdfs.com│────────▶│   Pages          │                 │
│  │                  │         │   (React Frontend)│                │
│  └──────────────────┘         └──────────────────┘                 │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ API calls (HTTPS)
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                            RAILWAY                                  │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │   Express.js Backend API                                      │   │
│  │   - Business logic                                          │   │
│  │   - JWT verification                                        │   │
│  │   - Database queries                                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ SQL queries
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           SUPABASE                                  │
│  ┌──────────────────┐         ┌──────────────────┐                 │
│  │   PostgreSQL     │         │   Authentication │                 │
│  │   Database       │         │   (Users, JWT)   │                 │
│  └──────────────────┘         └──────────────────┘                 │
│  ┌──────────────────┐                                              │
│  │   Storage (PDFs) │                                              │
│  └──────────────────┘                                              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Who Handles What? (Quick Reference)

| Task | Handled By | Notes |
|------|-----------|-------|
| Domain registration | ✅ Cloudflare | Already done by you |
| DNS & SSL | ✅ Cloudflare | Automatic |
| Website hosting (frontend) | ✅ Cloudflare Pages | React app lives here |
| API server (backend) | ✅ Railway | Express.js lives here |
| Database | ✅ Supabase | PostgreSQL, managed |
| User sign up / login | ✅ Supabase Auth | Built-in, no code needed |
| Password reset emails | ✅ Supabase Auth | Built-in |
| File uploads (PDFs) | ✅ Supabase Storage | Optional, built-in |
| Global CDN | ✅ Cloudflare | Fast loading worldwide |

---

**You're all set!** Follow each section step-by-step and you'll have a live, production-grade application.
