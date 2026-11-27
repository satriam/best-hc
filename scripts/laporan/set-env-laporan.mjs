#!/usr/bin/env node
/**
 * Tambahkan `GDRIVE_LAPORAN_FOLDER_ID` ke file env (default `.env.development`)
 * bila belum ada. Idempoten — tidak menimpa nilai yang sudah diisi.
 *
 * Pemakaian:
 *   node scripts/laporan/set-env-laporan.mjs [fileEnv] [folderId]
 */
import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envFile = resolve(process.cwd(), process.argv[2] ?? '.env.development');
const folderId = process.argv[3] ?? '1IHNYfFrP3ADjszGL3bIKTNw0IwkdajK4';

if (!existsSync(envFile)) {
  console.error(`File env tidak ditemukan: ${envFile}`);
  process.exit(1);
}

const current = readFileSync(envFile, 'utf8');
if (/^\s*GDRIVE_LAPORAN_FOLDER_ID\s*=/m.test(current)) {
  console.log('GDRIVE_LAPORAN_FOLDER_ID sudah ada di', envFile, '— tidak diubah.');
  process.exit(0);
}

const block =
  '\n# --- Google Drive: arsip Laporan Bulanan (folder "Laporan Bulanan") ---\n' +
  `GDRIVE_LAPORAN_FOLDER_ID="${folderId}"\n`;

appendFileSync(envFile, block, 'utf8');
console.log('Ditambahkan GDRIVE_LAPORAN_FOLDER_ID ke', envFile);
