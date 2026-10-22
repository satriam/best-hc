<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Best HCM — aturan kerja agent

## Branch & deploy (WAJIB)

| Branch | Environment | Database |
|---|---|---|
| **`development`** | Preview (Vercel) | `besthcm_dev` |
| **`master`** | Production (Vercel) | `besthcm_prod` |

- **Kerja SELALU di branch `development`.** Jangan commit/push langsung ke `master` — `master` hanya diisi lewat Pull Request + merge.
- Sebelum mulai: `git checkout development && git pull --rebase origin development`.
- Selesai unit kerja: commit → `git push origin development`.
- Merge ke `master` dilakukan **oleh user/CTO**, bukan worker.
- Saat merge ke `master`, Vercel menjalankan `prisma migrate deploy` → tabel baru otomatis masuk DB produksi.
- **Jangan** pakai `prisma db push`. Selalu `prisma migrate dev --name <nama>` dan **commit folder `prisma/migrations/`** bersama `schema.prisma`.
- Migration yang sudah pernah merge ke `master` **jangan diedit** — buat migration baru.
- Detail lengkap: `docs/BRANCHING-AND-DEPLOY.md`.

## Environment terpisah (WAJIB)

| Environment | App port | Container | DB port | Database | Env file |
|---|---|---|---|---|---|
| Development | **3005** | `postgres_dev` | **5433** | `besthcm_dev` | `.env.development` |
| Production | **3000** | `postgres` | **5432** | `besthcm_prod` | `.env.production` |

- **Dua container PostgreSQL terpisah** — jangan dicampur. `postgres_dev` (generik, dipakai bersama project lain) untuk development.
- **Jangan pernah** menjalankan/mengubah server production (port 3000) atau container `postgres` saat mengerjakan task dev.
- Dev selalu **mirror production**: `npm run db:mirror` (drop + restore dev dari prod). Cek dengan `npm run db:status`.
- `.env` hanya nilai shared (`AUTH_SECRET`). `DATABASE_URL` **wajib** di `.env.development` / `.env.production`, jangan di `.env`.
- Port dev **3005** — jangan pakai 3000 (produksi).
- Setelah `prisma migrate` / `prisma generate`, **restart** dev server (Prisma Client di memori bisa basi → `Unknown field ...`).

## Data testing

- **JANGAN hapus data massal tanpa konfirmasi eksplisit.** "Hapus data testing" **bukan** izin menghapus semua pengajuan — tanya dulu baris mana yang dianggap testing (slug/tanggal/nama), atau hapus hanya yang kamu buat sendiri.
- **Selalu `pg_dump` dulu** sebelum operasi destruktif ke `.backups/`.
- Kalau butuh data uji sementara, buat dengan penanda jelas (mis. `reason` diawali `[TEST]`) supaya bisa dihapus presisi.
- Setelah selesai menguji, bersihkan **hanya** data yang kamu buat:
  `bash scripts/clean-test-data.sh --yes` (atau `DB=besthcm_dev ...` untuk dev) — dan **konfirmasi** dulu cakupannya.
- Yang disimpan: users, jenis cuti, jatah kuota, hari libur, riwayat konfigurasi.

## Database

- PostgreSQL container `postgres` **dipakai bersama project lain** — jangan `docker compose down -v` / recreate container.
- Buat database baru via `psql -c "CREATE DATABASE ..."`, bukan dengan mengubah container.
