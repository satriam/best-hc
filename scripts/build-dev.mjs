#!/usr/bin/env node
/**
 * `next build` memakai NODE_ENV=production sehingga Next.js memuat
 * `.env.production`. Script npm `build` juga menjalankan `prisma migrate deploy`
 * — kalau dijalankan dari mesin dev, migrasi bisa nyasar ke database PRODUKSI.
 *
 * Wrapper ini:
 *   1. memuat `.env.development` (DATABASE_URL = besthcm_dev, port 5433),
 *   2. memaksa NODE_ENV=production hanya untuk tahap kompilasi,
 *   3. menjalankan `prisma generate` + `next build` TANPA `migrate deploy`.
 *
 * Jalankan: node scripts/build-dev.mjs
 */
import { spawnSync } from 'node:child_process';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.development', override: true });
loadEnv({ path: '.env' });

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL kosong: periksa .env.development');
  process.exit(1);
}

// Jangan pernah cetak credential — cukup host + nama database.
try {
  const url = new URL(process.env.DATABASE_URL);
  console.log(`build memakai database: ${url.hostname}:${url.port}${url.pathname}`);
} catch {
  console.log('build memakai DATABASE_URL dari .env.development');
}

const env = { ...process.env, NODE_ENV: 'production' };

const steps = [
  ['prisma generate', ['./node_modules/.bin/prisma', 'generate']],
  ['next build', ['./node_modules/.bin/next', 'build']],
];

for (const [label, [command, ...args]] of steps) {
  console.log(`\n### ${label}`);
  const result = spawnSync(command, args, { stdio: 'inherit', env });
  if (result.status !== 0) {
    console.error(`GAGAL: ${label} (exit ${result.status})`);
    process.exit(result.status ?? 1);
  }
}

console.log('\nBuild selesai tanpa menyentuh database produksi.');
