# ProPDFs - Enterprise Document Processing Platform

## Phase 1: MVP (Weeks 1-4)

### Sprint 1: Foundation
- [x] Project scaffolding (Flutter + FastAPI)
- [x] Docker & development environment
- [ ] Database schema & migrations (PostgreSQL)
- [ ] Core authentication (Email/Password + JWT)
- [ ] Basic Flutter UI shell (Material 3)

### Sprint 2: Core PDF Engine
- [ ] PDF merge service
- [ ] PDF split service
- [ ] PDF compress service
- [ ] File upload/download API (chunked)
- [ ] Basic PDF viewer widget

### Sprint 3: Conversion & Storage
- [ ] DOCX ↔ PDF conversion (LibreOffice headless)
- [ ] Image ↔ PDF conversion (PyMuPDF + Pillow)
- [ ] Cloudflare R2 integration
- [ ] File management dashboard

### Sprint 4: Polish & Payments
- [ ] Stripe subscription integration
- [ ] Usage tracking & limits
- [ ] Responsive layout refinement
- [ ] Error handling & logging

## Phase 2: Pro (Weeks 5-8)
- Google/GitHub OAuth
- Advanced PDF editing (rotate, rearrange, delete pages)
- OCR with Tesseract
- Watermarks & page numbers
- Team workspaces
- Mobile app stores (iOS/Android)

## Phase 3: Enterprise (Weeks 9-12)
- AI features (summarize, translate, extract)
- Cloud storage integrations (Drive, Dropbox, OneDrive)
- Passkey/WebAuthn + MFA
- RBAC & organization accounts
- API keys for developers
- SOC2 compliance features

## Tech Stack
- **Frontend:** Flutter 3.x + Riverpod + GoRouter + Material 3
- **Backend:** Python 3.11 + FastAPI + PostgreSQL + Redis + Celery
- **Storage:** Cloudflare R2
- **Payments:** Stripe
- **Auth:** JWT + OAuth2 + Passkeys (later)
- **PDF Engine:** PyMuPDF + LibreOffice + Pillow + Ghostscript
- **AI:** OpenAI/Claude API integration
- **Hosting:** Cloudflare Pages (frontend) + Railway (backend)
