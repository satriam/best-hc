# Best HCM — Human Capital Management

## Project Overview

Best HCM is an enterprise Human Capital Management web application built with **Next.js 16 (App Router)**, **Prisma ORM**, and **PostgreSQL**. It provides leave management, leave quota tracking, employee directory, and role-based approval workflows for organizational human resources.

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

Copy the environment template:

```bash
cp .env.example .env
```

Required environment variables in `.env`:

| Variable | Description | Example / Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5433/besthcm?schema=public` |
| `AUTH_SECRET` | NextAuth encryption secret | At least 32 random characters |
| `NEXTAUTH_URL` | Base application URL | `http://localhost:3000` |

*Never commit your actual `.env` file.*

---

## Database Setup

- **Engine**: PostgreSQL 17
- **Database Name**: `besthcm`
- **Default Port**: `5433` (DEV compose) or `5432`

### Run Migrations & Generate Prisma Client

```bash
# Push schema directly to the database
npx prisma db push

# Or run migrations
npx prisma migrate dev

# Generate Prisma Client
npx prisma generate
```

---

## Running the Project

### Standalone Mode (from project directory)
```bash
npm run dev
```
The application will be accessible at: `http://localhost:3000`

### Multi-Project Workspace Mode (from Satr-dev root)
```bash
npm run project -- best-hcm
```

---

## Production Build

```bash
# Build optimized production bundle
npm run build

# Start production server
npm run start
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
