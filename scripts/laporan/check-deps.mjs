#!/usr/bin/env node
/**
 * Cek konsistensi package.json vs package-lock.json untuk dependency yang
 * dipakai generator/parser laporan (`@xmldom/xmldom`, `pizzip`,
 * `docxtemplater`, `docxtemplater-image-module-free`).
 *
 * Jalankan: node scripts/laporan/check-deps.mjs
 */
import { readFileSync } from 'node:fs';

const lock = JSON.parse(readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

const wanted = ['pizzip', 'docxtemplater', 'docxtemplater-image-module-free', '@xmldom/xmldom'];
const rootDeps = lock.packages['']?.dependencies ?? {};

console.log('lockfileVersion:', lock.lockfileVersion);
for (const name of wanted) {
  const entry = lock.packages[`node_modules/${name}`];
  console.log(
    name.padEnd(32),
    'pkg=' + (pkg.dependencies[name] ?? '-'),
    '| rootLock=' + (rootDeps[name] ?? '-'),
    '| lockEntry=' + (entry ? entry.version : 'MISSING')
  );
}
console.log('--- root deps in package.json:', Object.keys(pkg.dependencies).length);
