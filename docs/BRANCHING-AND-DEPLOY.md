# Branching & Deployment (GitHub + Vercel)

## Model branch

| Branch | Fungsi | Vercel Environment | Database |
|---|---|---|---|
| **`development`** | kerja harian, staging | **Preview** | `besthcm_dev` |
| **`master`** | production | **Production** | `besthcm_prod` |

Alur:

```
development  ──(kerja + push)──►  Preview Deploy (otomatis)
     │
     └──(Pull Request + merge)──►  master  ──►  Production Deploy (otomatis)
                                                    └─ prisma migrate deploy
                                                       → tabel baru masuk DB produksi
```

`master` = default branch di GitHub. Semua perubahan masuk lewat **Pull Request** dari `development`.

---

## Migrasi database saat merge ke master

`package.json` sudah memakai build command:

```json
"build": "prisma generate && prisma migrate deploy && next build"
```

Artinya setiap deploy production Vercel otomatis:

1. `prisma generate` — bikin Prisma Client
2. **`prisma migrate deploy`** — menerapkan **semua migration yang belum jalan** ke database produksi (termasuk tabel/kolom baru)
3. `next build` — build aplikasi

Jadi **merge ke `master` = tabel baru otomatis dibuat di DB produksi**. Tidak perlu langkah manual.

### Alur kerja migrasi yang benar

```bash
# 1. Selalu di branch development, DB dev
git checkout development
npx prisma migrate dev --name add_spkl_tables   # buat migration + apply ke besthcm_dev
#    → folder prisma/migrations/<timestamp>_add_spkl_tables/ dibuat

# 2. Commit migration-nya (WAJIB — jangan hanya schema.prisma)
git add prisma/migrations prisma/schema.prisma
git commit -m "feat(db): tabel SPKL"
git push origin development

# 3. Uji di Preview Deploy (Vercel)

# 4. Pull Request development → master, lalu merge
#    → Vercel production build menjalankan prisma migrate deploy
#    → tabel baru muncul di besthcm_prod
```

**Aturan penting:**

- **Jangan** pakai `prisma db push` untuk perubahan yang akan naik ke production — tidak menghasilkan file migration, jadi production tidak ikut berubah.
- **Selalu commit folder `prisma/migrations/`** bersama `schema.prisma`.
- Migration harus **aditif** kalau memungkinkan (tambah tabel/kolom nullable). Hindari `DROP COLUMN`/rename di satu langkah — pakai 2 tahap (deploy kode baru dulu, hapus kolom di rilis berikutnya).
- **Jangan** mengedit migration yang sudah pernah di-merge ke `master` — Prisma mencatat checksum; edit akan membuat deploy gagal. Buat migration baru.

---

## Konfigurasi Vercel

### 1. Hubungkan repo

Vercel → **Add New → Project** → import `satriam/best-hc`.

| Setting | Nilai |
|---|---|
| Framework Preset | Next.js |
| Root Directory | `./` |
| Build Command | *(biarkan default — diambil dari `vercel.json`)* |
| Install Command | `npm install` |
| Output Directory | `.next` (default) |
| Node.js Version | 20.x |

### 2. Environment Variables

Buka **Project → Settings → Environment Variables**, isi **per environment**:

| Variable | Production | Preview (development) |
|---|---|---|
| `DATABASE_URL` | `postgresql://…@host-prod/besthcm_prod?schema=public&sslmode=require` | `postgresql://…@host-dev/besthcm_dev?schema=public&sslmode=require` |
| `AUTH_SECRET` | string acak ≥32 char | string acak ≥32 char (**beda** dari production) |

> ⚠️ **Jangan** memakai `localhost` di Vercel. Server Vercel tidak bisa menjangkau
> database di komputermu. Production & Preview **wajib** pakai PostgreSQL yang bisa
> diakses publik (Neon / Supabase / Railway / RDS), dengan `sslmode=require`.

### 3. Git settings

**Settings → Git**:

- **Production Branch**: `master`
- Preview Deployments: aktif untuk semua branch (atau batasi ke `development`)

`vercel.json` di repo sudah mengatur `deploymentEnabled` untuk `master` + `development`.

---

## Pindah dari Postgres lokal ke Postgres hosted

Database sekarang ada di Docker lokal (`postgres` :5432, `postgres_dev` :5433).
Supaya Vercel bisa connect, pindahkan ke penyedia hosted.

### Opsi A — Neon (paling mudah, ada free tier)

1. Daftar di https://neon.tech → **Create project**
2. Buat **dua database** (atau dua project): `besthcm_prod` dan `besthcm_dev`
3. Salin connection string (sudah termasuk `?sslmode=require`)
4. Import data dari lokal:

```bash
# dump dari lokal
docker exec postgres pg_dump -U postgres -d besthcm_prod --no-owner --no-acl > prod.sql
docker exec postgres_dev pg_dump -U postgres -d besthcm_dev --no-owner --no-acl > dev.sql

# restore ke Neon (pakai connection string dari dashboard)
psql "<NEON_PROD_URL>" -f prod.sql
psql "<NEON_DEV_URL>"  -f dev.sql
```

5. Pasang connection string itu di Vercel (Production & Preview) dan di
   `.env.production` / `.env.development` untuk kerja lokal.

> Untuk Prisma + Neon, gunakan **pooled connection** (host mengandung `-pooler`)
> untuk `DATABASE_URL`, dan tambahkan `?pgbouncer=true&connect_timeout=15` bila perlu.

### Opsi B — Supabase / Railway

Sama polanya: buat project → ambil connection string (SSL wajib) → restore dump → pasang di Vercel.

---

## Checklist rilis

- [ ] Kerja di branch `development`, bukan `master`
- [ ] `npx prisma migrate dev --name <nama>` (DB dev) → folder migration dibuat
- [ ] `git add prisma/schema.prisma prisma/migrations` → commit → push
- [ ] `npm run lint` + `npm run build` lokal hijau
- [ ] Preview Deploy Vercel sukses & diuji
- [ ] Pull Request `development` → `master`, review, merge
- [ ] Cek Vercel **Production Deploy** hijau (lihat log: `prisma migrate deploy` jalan)
- [ ] Verifikasi di production: tabel/kolom baru ada, aplikasi normal
- [ ] Kalau deploy gagal di tahap migrate → **rollback** di Vercel (Promote previous deployment) lalu perbaiki migration

---

## Troubleshooting

| Gejala | Penyebab | Solusi |
|---|---|---|
| `P1001: Can't reach database server` | `DATABASE_URL` masih `localhost` | Ganti ke host publik + `sslmode=require` |
| `P3009: migrate found failed migrations` | migration gagal di tengah | Perbaiki manual di DB, lalu `prisma migrate resolve --applied <migration>` |
| `P3005: database schema is not empty` | DB produksi dibuat tanpa migration history | `prisma migrate resolve --applied <migration-pertama>` atau baseline |
| Build sukses tapi tabel tidak ada | `db push` dipakai, bukan `migrate dev` | Buat migration yang benar lalu merge |
| Prisma Client error `Unknown field` | client basi | `prisma generate` ulang, restart server |
