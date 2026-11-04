# Laporan Bulanan (backend)

Fitur cetak/arsip laporan pekerjaan bulanan. Dokumen **tidak** dibangun ulang
dari nol: template resmi dipakai apa adanya (logo cover, header/footer, style,
margin, tabel persetujuan 11 baris), lalu diisi `docxtemplater`, sehingga hasil
generate identik layout-nya dengan contoh.

## Alur

```
.docx mentah (opsional)
   └─ POST /api/laporan/parse      -> modul + caption + gambar (data URL)
        └─ form lengkap di UI
             └─ POST /api/laporan/generate  -> file .docx + header X-Laporan-Id (draft di DB)
                  └─ POST /api/laporan/:id/selesai -> upload ke Drive "Laporan Bulanan", status=selesai
```

## File penting

| Path | Isi |
|---|---|
| `templates/laporan-bulanan.docx` | Template hasil bedah XML dari `laporan-generator/reference/contoh-laporan-bulanan.docx` |
| `scripts/laporan/build-template.mjs` | Pembuat template (jalankan ulang hanya bila file contoh berubah) |
| `src/lib/laporan/parse-docx.ts` | Parser .docx → `{ metaGuess, modules, narratives, stats }` |
| `src/lib/laporan/build-docx.ts` | Render payload → buffer .docx (docxtemplater + image module) |
| `src/lib/laporan/{types,format,images}.ts` | Tipe, format tanggal/periode Indonesia, util gambar |
| `src/schemas/laporan.schema.ts` | Validasi zod untuk generate + CRUD penanda tangan |
| `src/services/laporan.service.ts` | Generate, simpan draft, arsip Drive, list/detail |
| `src/services/laporan-signer.service.ts` | Master penanda tangan (DIBUAT / DIPERIKSA / DISETUJUI) |
| `src/services/google-drive.service.ts` | `uploadFileToDrive` (folder override), `listDriveFiles`, `deleteDriveFile` |
| `prisma/seed-laporan.ts` | Seed 4 penanda tangan contoh (hanya bila tabel kosong) |

## API (semua butuh session login, 401 tanpa session)

| Method | Path | Keterangan |
|---|---|---|
| POST | `/api/laporan/parse` | multipart field `files` (1..N .docx), total ≤ 10 MB. Respons `{ docs, modules, metaGuess, stats }`; gambar sebagai data URL base64 |
| POST | `/api/laporan/generate` | JSON `{ meta, items, signers, revisions, intro, scope }` → file .docx (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`) + header `X-Laporan-Id` & `X-Laporan-File-Name` (draft di-upsert per period+project+version) |
| POST | `/api/laporan/[id]/selesai` | Generate ulang dari payload tersimpan, hapus file Drive lama (bila ada), upload ke folder `GDRIVE_LAPORAN_FOLDER_ID`, set `status=selesai` |
| GET | `/api/laporan?period=YYYY-MM&status=draft\|selesai` | Daftar laporan |
| GET | `/api/laporan/[id]` | Detail + payload tersimpan (`meta`) |
| GET | `/api/laporan/signers?role=&active=` | Master penanda tangan (lihat semua yang aktif) |
| POST | `/api/laporan/signers` | ADMIN only |
| GET/PUT/PATCH/DELETE | `/api/laporan/signers/[id]` | Baca untuk user login; tulis ADMIN only |

Catatan validasi: `meta.period` wajib `YYYY-MM` (kunci unique), `meta.periodLabel`
opsional (label tampilan, mis. `04 Oktober - 03 November 2026`), `meta.date` boleh
ISO `YYYY-MM-DD` dan diformat ke `5 November 2026` saat generate.

## Environment

| Env | Keterangan |
|---|---|
| `GDRIVE_LAPORAN_FOLDER_ID` | ID folder arsip `Laporan Bulanan` (`1IHNYfFrP3ADjszGL3bIKTNw0IwkdajK4`). Kosong → fallback `GDRIVE_FOLDER_ID` |
| `GOOGLE_OAUTH_*` | Sudah dipakai arsip PDF bertanda tangan |

Nilai nyata hanya diisi di `.env.development` / `.env.production` (gitignored).
Untuk produksi, tambahkan `GDRIVE_LAPORAN_FOLDER_ID` di Environment Variables
Vercel (Production + Preview) — nilai di repo hanya placeholder di `.env.example`.

## Operasional

```bash
# migrasi (dev saja; produksi lewat merge PR → `prisma migrate deploy` di Vercel)
npx prisma migrate dev --name laporan_bulanan

# seed master penanda tangan (idempoten: berhenti bila tabel tidak kosong)
./node_modules/.bin/tsx prisma/seed-laporan.ts     # atau: npm run db:seed:laporan

# bangun ulang template dari file contoh (hanya bila contoh berubah)
node scripts/laporan/build-template.mjs
```

## Verifikasi (script yang dipakai saat implementasi)

| Script | Kegunaan |
|---|---|
| `node scripts/laporan/verify-api.mjs` | E2E HTTP: login → parse contoh → generate → cek isi .docx → list/detail → CRUD signer → arsip Drive. Ringkasan di `out/verify-api.json` & `out/verify-api.log` |
| `node scripts/laporan/verify-render.mjs templates/laporan-bulanan.docx <hasil.docx>` | Pembanding template vs hasil: logo & header identik, jumlah style, tabel persetujuan (baris/sel/gridSpan/vMerge/trHeight), sisa placeholder, dua field TOC |
| `node scripts/laporan/verify-captions.mjs <hasil.docx>` | Dump paragraf caption lampiran (style `Caption`, field `SEQ Figure`) |
| `./node_modules/.bin/tsx scripts/laporan/verify-drive.ts list\|delete <id>\|cleanup` | `files.list?q='<folder>' in parents`, hapus file uji, bersihkan baris DB uji |
| `node scripts/laporan/check-deps.mjs` | Konsistensi `package.json` vs `package-lock.json` untuk dependency laporan |

`npm run build` menjalankan `prisma migrate deploy`, sehingga dari mesin dev bisa
menyentuh database produksi. Untuk kompilasi lokal pakai `node scripts/build-dev.mjs`
(`npm run build:dev`): memuat `.env.development`, lalu `prisma generate` +
`next build` tanpa `migrate deploy`.

## Catatan teknis

- **Dependency.** `docxtemplater@3.71.1`, `docxtemplater-image-module-free@1.1.1`,
  `pizzip@3.3.0`, `@xmldom/xmldom@0.9.12`. Versi docxtemplater dipin lewat URL
  tarball karena `npm install <nama>` diblokir pemindai paket di mesin dev;
  memasang ulang: `npm install` biasa tetap jalan (lock sudah berisi tarball).
  `docxtemplater@3.x` berjalan di Node 20 (dipakai Next 16 dev server) — sudah
  diuji lewat build + E2E.
- `docxtemplater-image-module-free` masih menarik `xmldom@0.1.31` (deprecated).
  Pemakaiannya hanya jalur `.pptx`; jalur `.docx` memakai `@xmldom/xmldom`.
- **Tag flat, bukan bertitik.** docxtemplater tidak mendukung `{a.b}`; karena itu
  template memakai `{dibuatNama}`, `{dibuatJabatan}`, `{dibuatInstansi}`, dst.
  (`buildTemplateData()` di `build-docx.ts` yang memetakan payload bersarang).
- **Parser** memakai `@xmldom/xmldom` (bukan `fast-xml-parser`) karena butuh
  traversal DOM berurutan; modul = heading terdekat di atas gambar, caption =
  style `Caption` / teks `Figure N`, gambar di dalam textbox (logo cover) dan
  gambar sebelum heading pertama dilewati.
- **TOC** memakai `w:fldSimple` + `updateFields=true` di `word/settings.xml`,
  jadi Word meminta refresh daftar isi/gambar saat dokumen dibuka.
- Isi payload lengkap (termasuk gambar base64) disimpan di kolom `meta`
  (`laporan_bulanan.meta`, JSONB) supaya `/selesai` bisa generate ulang tanpa
  upload ulang dari browser.
