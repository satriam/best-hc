# Best HCM — Human Capital Management

## Project Overview

Best HCM is an enterprise Human Capital Management web application built with **Next.js 16 (App Router)**, **Prisma ORM**, and **PostgreSQL**. It provides leave management, leave quota tracking, employee directory, SPKL (overtime work order), and role-based approval workflows for organizational human resources.

> **Branching**: `master` = production (Vercel), `development` = staging/preview.
> Migrasi database otomatis jalan saat merge ke `master`. Detail: **[docs/BRANCHING-AND-DEPLOY.md](docs/BRANCHING-AND-DEPLOY.md)**.

### Main Technologies
- **Framework**: Next.js 16 (App Router, Turbopack, React 19)
- **Database**: PostgreSQL 17 (Prisma ORM)
- **Authentication**: Auth.js / NextAuth (JWT bearer & session cookies)
- **Styling**: Tailwind CSS, Radix UI primitives, Lucide React icons
- **Language**: TypeScript

---

## Project Structure

```text
projects/best-hcm/
├── app/                    # Next.js App Router (pages, api routes, server actions)
│   ├── (auth)/             # Login and authentication views
│   ├── (dashboard)/        # Main HRM dashboards (leaves, employees, quotas)
│   └── api/                # Internal API endpoints
├── components/             # Reusable UI components (tables, modals, forms)
├── lib/                    # Server utilities, Prisma client singleton, auth helpers
├── prisma/
│   ├── schema.prisma       # Database schema (User, Role, LeaveQuota, LeaveRequest)
│   └── migrations/         # PostgreSQL schema migrations
├── public/                 # Static assets
├── project.json            # Satr-dev multi-project manifest
├── .env.example            # Environment configuration template
└── README.md
```

---

## Requirements

- **Node.js**: `v20.0.0` or higher
- **npm**: `v10.0.0` or higher
- **PostgreSQL**: `v16` or `v17` (running via `infrastructure/database/dev` on port `5433` or `5432`)

---

## Installation

```bash
# Navigate to the project directory
cd projects/best-hcm

# Install dependencies
npm install
```

---

## Environment Configuration

**Development dan Production DIPISAH** — port dan database berbeda, data dev selalu mirror production.

| Environment | Port | Database | Env file |
|---|---|---|---|
| Development | **3005** | `besthcm_dev` | `.env.development` |
| Production | **3000** | `besthcm_prod` | `.env.production` |

File `.env` hanya untuk nilai **shared** (mis. `AUTH_SECRET`) — **jangan** taruh `DATABASE_URL` di sana.
Next.js otomatis memuat `.env.<NODE_ENV>`: `npm run dev` → `.env.development`, `npm start` → `.env.production`.

```bash
cp .env.example .env
cp .env.example .env.development   # lalu isi DATABASE_URL ke besthcm_dev
cp .env.example .env.production    # lalu isi DATABASE_URL ke besthcm_prod
```

| Variable | Description |
|---|---|
| `DATABASE_URL` | Connection string PostgreSQL (per environment) |
| `AUTH_SECRET` | NextAuth encryption secret, minimal 32 karakter |
| `GOOGLE_OAUTH_CLIENT_ID` | OAuth2 client ID (Google Cloud Console → Credentials, tipe "Web application") |
| `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth2 client secret pasangannya |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | Refresh token akun **pemilik folder** dengan scope `https://www.googleapis.com/auth/drive` |
| `GDRIVE_FOLDER_ID` | ID folder Google Drive tujuan arsip PDF tanda tangan (dari URL `.../folders/<ID>`) |

### Google Drive — arsip PDF tanda tangan

Fitur upload PDF bertanda tangan (SPKL & Pengajuan Cuti) menyimpan file ke satu folder
Google Drive lalu menyimpan link-nya di tabel `signed_documents`. Tidak ada dependency
tambahan: `POST oauth2.googleapis.com/token` (grant `refresh_token`) → REST Drive API
(`fetch`). Setelah upload, file otomatis diberi permission *anyone with link (reader)*
supaya `webViewLink` bisa dibuka tanpa login.

> **Catatan penting:** auth memakai OAuth2 **akun user pemilik folder**, bukan service
> account. Service account tidak punya storage quota sendiri sehingga upload ke folder
> My Drive akun personal selalu gagal `403 Service Accounts do not have storage quota`.

Endpoint (lihat `src/app/api/documents/...`):

| Method | Path | Akses |
|---|---|---|
| `POST` | `/api/documents/:entityType/:entityId` (multipart `file`, PDF ≤ 10 MB) | ADMIN |
| `GET` | `/api/documents/:entityType/:entityId` | semua user login |
| `DELETE` | `/api/documents/:entityType/:entityId/:docId` (soft delete) | ADMIN |

`entityType`: `SPKL` \| `LEAVE_REQUEST`.

*Never commit your actual `.env*` files.*

---

## Database Setup

- **Engine**: PostgreSQL 16
- **Dua container terpisah**:

| Container | Port | Environment | Database |
|---|---|---|---|
| `postgres` | **5432** | Production | `besthcm_prod` |
| `postgres_dev` | **5433** | Development | `besthcm_dev` (mirror production) |

> Container `postgres` (produksi) dipakai bersama banyak project lain — **jangan** di-recreate
> atau `docker compose down -v`. Compose di repo ini hanya mengelola `postgres_dev`.

### Nyalakan database dev
```bash
docker compose up -d          # membuat/menyalakan container postgres_dev (port 5433)
```

### Perintah database

```bash
npm run db:status    # bandingkan prod (5432) vs dev (5433) + cek mirror
npm run db:mirror    # segarkan dev dari prod (dev di-DROP lalu di-restore)
npx prisma migrate dev        # buat/terapkan migrasi (di DB dev)
npx prisma generate           # regenerate Prisma Client
```

> **Penting**: setelah `prisma migrate` / `prisma generate`, **restart** dev server —
> Prisma Client di memori bisa basi dan menyebabkan error `Unknown field ...`.

### Hapus data testing
```bash
bash scripts/clean-test-data.sh          # target besthcm_prod (minta konfirmasi)
DB=besthcm_dev bash scripts/clean-test-data.sh --yes
```
Yang dihapus: semua pengajuan cuti + segmen + riwayat kuota terkait, `usedQuota` direset.
Yang disimpan: users, jenis cuti, jatah kuota, hari libur nasional, riwayat konfigurasi kuota.

---

## Running the Project

### Development (port 3005, DB `besthcm_dev`)
```bash
npm run dev
```
→ `http://localhost:3005`

### Production (port 3000, DB `besthcm_prod`)
```bash
npm run build
npm start
```
→ `http://localhost:3000`

### Multi-Project Workspace Mode (from Satr-dev root)
```bash
npm run project -- best-hcm
```

---

## Deployment

A standalone `docker-compose.yml` is provided for isolated container deployment:

```bash
# Build and run with Docker
docker compose up -d --build
```

---

## Troubleshooting

- **Database Connection Error (`P1001`)**:
  Ensure PostgreSQL is running via `cd ../../infrastructure/database/dev && docker compose up -d` and verify the port matches `DATABASE_URL` (port `5433` in Satr-dev dev stack).
- **Next.js Turbopack Cache Glitch**:
  If page fails to compile after schema changes, clear `.next`:
  ```bash
  rm -rf .next && npm run dev
  ```
