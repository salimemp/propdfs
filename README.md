# ProPDFs - Professional PDF Converter

A comprehensive, enterprise-grade PDF conversion and management platform built with React, TypeScript, and Node.js.

## Features

### PDF Conversion
- **Multi-format Support**: Convert between PDF, Word (DOCX), Excel (XLSX), PowerPoint (PPTX), images (PNG, JPG), HTML, and more
- **Batch Processing**: Process multiple files simultaneously with progress tracking
- **OCR Support**: Extract text from scanned documents with context-aware text recognition
- **Quality Preservation**: Maintain document formatting and quality during conversion

### PDF Editing
- **Full Editor**: Annotate, highlight, underline, strikethrough, and add text to PDFs
- **Form Filling**: Fill out PDF forms digitally with support for text fields, checkboxes, and signatures
- **Digital Signatures**: Add and verify digital signatures
- **Watermarks**: Add custom watermarks to protect your documents

### Document Comparison
- **Visual Diff**: Compare two PDF documents side-by-side
- **Change Tracking**: Identify additions, deletions, and modifications
- **Export Reports**: Generate comparison reports in various formats

### File Management
- **Cloud Storage**: Organize files in folders with tags and search
- **Version History**: Point-in-time recovery with automatic snapshots
- **Smart Sync**: Sync files across devices with conflict resolution
- **Cloud Integration**: Connect to Google Drive, OneDrive, Dropbox, and Box

### Authentication & Security
- **Multiple Auth Methods**:
  - Manus OAuth (primary)
  - Email/Password with verification
  - Magic Link (passwordless)
  - Social Login (Google, GitHub)
  - TOTP 2FA with authenticator apps
  - Passkey/WebAuthn biometric authentication
- **Security Features**:
  - Backup codes for account recovery
  - Device management
  - Session tracking

### Accessibility
- **Voice Commands**: Control the app with voice commands
- **Read Aloud**: Text-to-speech for PDF documents
- **High Contrast Mode**: Improved visibility for users with visual impairments
- **Keyboard Navigation**: Full keyboard accessibility

### Team Collaboration
- **Team Workspaces**: Share files and collaborate with team members
- **Role-based Access**: Admin, editor, and viewer roles
- **Activity Tracking**: Audit logs for all actions

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS 4, shadcn/ui
- **Backend**: Node.js, Express, tRPC
- **Database**: MySQL/TiDB with Drizzle ORM
- **Authentication**: Manus OAuth, JWT
- **Storage**: S3-compatible object storage
- **Testing**: Vitest

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 8+
- MySQL/TiDB database

### Installation

1. Clone the repository:
```bash
git clone https://github.com/salimemp/propdfs.git
cd propdfs
```

2. Install dependencies:
```bash
pnpm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Push database schema:
```bash
pnpm db:push
```

5. Start the development server:
```bash
pnpm dev
```

The app will be available at `http://localhost:3000`.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | MySQL/TiDB connection string |
| `JWT_SECRET` | Secret for JWT token signing |
| `VITE_APP_ID` | Manus OAuth application ID |
| `OAUTH_SERVER_URL` | Manus OAuth backend URL |
| `VITE_OAUTH_PORTAL_URL` | Manus login portal URL |
| `BUILT_IN_FORGE_API_URL` | Manus built-in APIs URL |
| `BUILT_IN_FORGE_API_KEY` | Manus API key (server-side) |
| `GOOGLE_DRIVE_CLIENT_ID` | Google Drive OAuth client ID |
| `GOOGLE_DRIVE_CLIENT_SECRET` | Google Drive OAuth client secret |
| `ONEDRIVE_CLIENT_ID` | OneDrive OAuth client ID |
| `ONEDRIVE_CLIENT_SECRET` | OneDrive OAuth client secret |
| `DROPBOX_CLIENT_ID` | Dropbox OAuth client ID |
| `DROPBOX_CLIENT_SECRET` | Dropbox OAuth client secret |
| `BOX_CLIENT_ID` | Box OAuth client ID |
| `BOX_CLIENT_SECRET` | Box OAuth client secret |

## Project Structure

```
propdfs/
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── contexts/       # React contexts
│   │   ├── hooks/          # Custom hooks
│   │   ├── lib/            # Utilities and tRPC client
│   │   └── pages/          # Page components
│   └── public/             # Static assets
├── server/                 # Backend Express server
│   ├── _core/              # Core infrastructure
│   ├── routers.ts          # tRPC routers
│   ├── db.ts               # Database helpers
│   └── *.ts                # Service modules
├── drizzle/                # Database schema and migrations
├── shared/                 # Shared types and constants
└── storage/                # S3 storage helpers
```

## API Documentation

### tRPC Routers

- **auth**: Authentication and user management
- **files**: File upload, download, and management
- **folders**: Folder organization
- **conversions**: PDF conversion operations
- **pdf**: PDF manipulation (merge, split, compress)
- **editor**: PDF annotation and editing
- **compare**: Document comparison
- **teams**: Team collaboration
- **cloudStorage**: Cloud provider integration
- **sync**: Cross-device synchronization
- **recovery**: Point-in-time file recovery
- **ocr**: Context-aware text recognition

## Testing

Run the test suite:
```bash
pnpm test
```

Run tests in watch mode:
```bash
pnpm test:watch
```

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start development server |
| `pnpm build` | Build for production |
| `pnpm test` | Run tests |
| `pnpm db:push` | Push schema changes to database |
| `pnpm lint` | Run ESLint |

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is proprietary software. All rights reserved.

## Support

For support, please contact the development team or open an issue on GitHub.

---

Built with ❤️ by the ProPDFs Team
