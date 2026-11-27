#!/usr/bin/env node
/**
 * Uji E2E HTTP fitur Laporan Bulanan pada dev server (port 3005).
 *
 * Alur: login -> parse docx contoh -> generate docx -> periksa hasil ->
 * list/detail -> CRUD signer (data uji) -> arsip ke Drive (`/selesai`).
 * File uji di Drive + baris DB uji dibersihkan oleh `verify-cleanup.ts`
 * supaya bisa diperiksa manual dulu di sini.
 *
 * Jalankan: node scripts/laporan/verify-api.mjs
 * Output ringkasan: out/verify-api.json (tanpa base64 gambar)
 */
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import PizZip from 'pizzip';

const ROOT = resolve(import.meta.dirname, '../..');
const BASE = process.env.API_BASE ?? 'http://127.0.0.1:3005';
const REFERENCE = resolve(ROOT, '../laporan-generator/reference/contoh-laporan-bulanan.docx');
const OUT = resolve(ROOT, 'out');
mkdirSync(OUT, { recursive: true });

const result = { base: BASE, steps: [], errors: [] };
let cookie = '';

function log(step, detail) {
  result.steps.push({ step, ...detail });
  console.log(`\n== ${step} ==`);
  console.log(typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2));
}

async function api(path, init = {}) {
  const headers = new Headers(init.headers ?? {});
  if (cookie) headers.set('cookie', cookie);
  const response = await fetch(`${BASE}${path}`, { ...init, headers });
  const setCookie = response.headers.getSetCookie?.() ?? [];
  for (const raw of setCookie) {
    if (raw.startsWith('besthcm_session=')) cookie = raw.split(';')[0];
  }
  return response;
}

// 0. Rute tanpa sesi harus 401.
const unauth = await api('/api/laporan');
const unauthParse = await api('/api/laporan/parse', { method: 'POST' });
log('401 tanpa session', { list: unauth.status, parse: unauthParse.status });
if (unauth.status !== 401 || unauthParse.status !== 401) result.errors.push('rute tidak 401 tanpa session');

// 1. Login admin.
const loginResponse = await api('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@besthcm.com', password: 'admin123' }),
});
const loginBody = await loginResponse.json();
log('login', { status: loginResponse.status, success: loginBody.success, user: loginBody.data?.email, cookie: cookie ? 'ada' : 'TIDAK ADA' });
if (loginResponse.status !== 200 || !cookie) throw new Error('login gagal');

// 2. Parse docx contoh (multipart, 1 file).
const docxBytes = readFileSync(REFERENCE);
const form = new FormData();
form.append('files', new Blob([docxBytes]), 'contoh-laporan-bulanan.docx');
const parseResponse = await api('/api/laporan/parse', { method: 'POST', body: form });
const parseBody = await parseResponse.json();
const parsedDoc = parseBody.data?.docs?.[0];
log('parse contoh-laporan-bulanan.docx', {
  status: parseResponse.status,
  success: parseBody.success,
  stats: parseBody.data?.stats,
  parseStats: parsedDoc?.stats,
  metaGuess: parsedDoc?.metaGuess,
  modules: (parsedDoc?.modules ?? []).map((module) => ({
    name: module.name,
    items: module.items.length,
    captions: module.items.map((item) => item.caption),
  })),
  narrativeCount: parsedDoc?.narratives?.length,
});
if (parseResponse.status !== 200) result.errors.push('parse gagal: ' + JSON.stringify(parseBody).slice(0, 300));
writeFileSync(resolve(OUT, 'verify-parse.json'), JSON.stringify(parseBody.data, (key, value) => (key === 'dataUrl' ? undefined : value), 2));

// 3. Generate .docx lewat API memakai hasil parser (gambar ikut lampiran).
const parsedModules = parsedDoc?.modules ?? [];
const items = [];
let imageIndex = 0;
for (const parsedModule of parsedModules) {
  for (const item of parsedModule.items) {
    imageIndex += 1;
    items.push({
      modul: parsedModule.name.slice(0, 100),
      fitur: item.caption.slice(0, 200),
      status: 'Selesai',
      percent: 100,
      note: '',
      ...(item.dataUrl && imageIndex <= 4 ? { gambar: item.dataUrl, caption: item.caption } : {}),
    });
  }
}
// Minimal 1 item, walau dokumen contoh tidak punya gambar.
if (items.length === 0) {
  items.push({ modul: 'Pengembangan Aplikasi', fitur: 'Uji generate tanpa gambar', status: 'Selesai', percent: 100 });
}

const generatePayload = {
  meta: {
    project: 'Pengadaan Pekerjaan Joint Development Digitalisasi Aplikasi Human Capital Operations',
    title: 'Laporan Pekerjaan Jasa Joint Development Digitalisasi Aplikasi Human Capital Operations',
    period: '2026-11',
    periodLabel: '04 Oktober - 03 November 2026',
    docNo: '2496/Eks-BEST/BA/PBOE-272/XI/2026',
    version: '1.0',
    date: '2026-11-05',
  },
  items,
  signers: {
    dibuat: { nama: 'Satria Mulya Adiwardana', jabatan: 'Programmer Web', instansi: 'PT Bukit Energi Servis Terpadu' },
    diperiksa: { nama: 'Zulfikar Murakabiman', jabatan: 'Programming Staff', instansi: 'PT Bukit Asam (Persero) Tbk' },
    disetujui: { nama: 'Zulkurniadi', jabatan: 'Direktur', instansi: 'PT Bukit Energi Servis Terpadu' },
    disetujui2: { nama: 'Dedek Apriyani', jabatan: 'Application Development & Services/EIS Department Head', instansi: 'PT Bukit Asam (Persero) Tbk' },
  },
  revisions: [{ versi: '1.0', nama: 'Satria Mulya Adiwardana', tanggal: '2026-11-05', keterangan: 'Dokumen Awal' }],
  intro: [
    'Teknologi informasi memiliki peranan penting dalam mendukung proses bisnis PT Bukit Asam (Persero) Tbk.',
    'Laporan ini merangkum pelaksanaan pekerjaan pengembangan aplikasi pada periode pelaporan.',
  ],
  scope: ['Pengembangan modul Human Capital Operations.', 'Pemeliharaan data master dan integrasi.'],
};

const generateResponse = await api('/api/laporan/generate', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(generatePayload),
});
const laporanId = generateResponse.headers.get('x-laporan-id');
const fileName = generateResponse.headers.get('x-laporan-file-name');
const contentType = generateResponse.headers.get('content-type');
const generated = Buffer.from(await generateResponse.arrayBuffer());
const generatedPath = resolve(OUT, 'api-laporan.docx');
if (generateResponse.ok) writeFileSync(generatedPath, generated);

log('generate', {
  status: generateResponse.status,
  contentType,
  bytes: generated.length,
  laporanId,
  fileName,
  saved: generateResponse.ok ? generatedPath : null,
});
if (!generateResponse.ok) {
  result.errors.push('generate gagal: ' + generated.toString('utf8').slice(0, 300));
}

// 4. Periksa isi .docx hasil generate.
if (generated.length > 0 && generateResponse.ok) {
  const zip = new PizZip(generated);
  const documentXml = zip.file('word/document.xml').asText();
  const textNodes = documentXml.match(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g) ?? [];
  const leftoverTags = textNodes
    .map((node) => node.replace(/<[^>]+>/g, ''))
    .filter((text) => /[{}]/.test(text));
  const media = Object.keys(zip.files).filter((name) => /^word\/media\//.test(name));
  const templateZip = new PizZip(readFileSync(resolve(ROOT, 'templates/laporan-bulanan.docx')));
  const templateHeader = templateZip.file('word/header1.xml')?.asText() ?? '';
  const generatedHeader = zip.file('word/header1.xml')?.asText() ?? '';
  const logo = media.find((name) => name.endsWith('image1.png'));

  const check = {
    tables: (documentXml.match(/<w:tbl>/g) ?? []).length,
    pictures: (documentXml.match(/<pic:pic\b/g) ?? []).length,
    mediaFiles: media.length,
    mediaNames: media.map((name) => `${name} (${zip.file(name).asNodeBuffer().length} B)`),
    logoPresent: Boolean(logo),
    logoBytes: logo ? zip.file(logo).asNodeBuffer().length : 0,
    templateLogoBytes: (() => {
      const buffer = templateZip.file('word/media/image1.png');
      return buffer ? buffer.asNodeBuffer().length : 0;
    })(),
    headerIdentical: templateHeader === generatedHeader,
    tocFields: (documentXml.match(/TOC \\o/g) ?? []).length,
    figureTocFields: (documentXml.replace(/&quot;/g, '"').match(/TOC \\h \\z \\c "Figure"/g) ?? []).length,
    updateFields: /<w:updateFields\b[^>]*w:val="true"/.test(zip.file('word/settings.xml')?.asText() ?? ''),
    leftoverPlaceholders: leftoverTags.slice(0, 10),
    leftoverCount: leftoverTags.length,
    figureCaptions: (documentXml.match(/<w:t(?:\s[^>]*)?>Figure\s*<\/w:t>/g) ?? []).length,
    captionParagraphs: (() => {
      const stylesXml = zip.file('word/styles.xml')?.asText() ?? '';
      const captionStyleIds = new Set(
        [...stylesXml.matchAll(/<w:style\b[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g)]
          .filter((match) => /<w:name w:val="captions?"/i.test(match[2]))
          .map((match) => match[1])
      );
      const paragraphs = documentXml.match(/<w:p(?=[\s>])[\s\S]*?<\/w:p>/g) ?? [];
      return paragraphs
        .filter((paragraph) => {
          const styleId = paragraph.match(/<w:pStyle w:val="([^"]+)"/)?.[1];
          return styleId ? captionStyleIds.has(styleId) : false;
        })
        .map((paragraph) =>
          (paragraph.match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g) ?? [])
            .map((node) => node.replace(/<[^>]+>/g, ''))
            .join('')
        )
        .filter((text) => text.trim().length > 0)
        .slice(0, 6);
    })(),
    sectionHeadings: (documentXml.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>/g) ?? [])
      .map((node) => node.replace(/<[^>]+>/g, ''))
      .filter((text) => /^(Laporan Pekerjaan|Pendahuluan|Ruang Lingkup|Daftar|Riwayat|Lembar|Lampiran)/i.test(text))
      .slice(0, 12),
  };
  check.sizeBytes = statSync(generatedPath).size;
  log('periksa hasil generate', check);
  if (check.leftoverCount > 0) result.errors.push('masih ada placeholder tersisa');
  if (!check.logoPresent) result.errors.push('logo cover hilang');
  if (!check.headerIdentical) result.errors.push('header berubah');
  if (!check.tocFields) result.errors.push('field TOC tidak ada');
}

// 5. List + detail.
const listResponse = await api('/api/laporan?period=2026-11');
const listBody = await listResponse.json();
log('GET /api/laporan?period=2026-11', {
  status: listResponse.status,
  count: listBody.data?.length,
  rows: (listBody.data ?? []).map((row) => ({ id: row.id, period: row.period, status: row.status, itemCount: row.itemCount })),
});

if (laporanId) {
  const detailResponse = await api(`/api/laporan/${laporanId}`);
  const detailBody = await detailResponse.json();
  log('GET /api/laporan/:id', {
    status: detailResponse.status,
    metaKeys: detailBody.data?.meta ? Object.keys(detailBody.data.meta) : null,
    itemCount: detailBody.data?.itemCount,
    savedSigners: detailBody.data?.meta?.signers,
  });
}

// 6. Master penanda tangan: GET + CRUD data uji.
const signersGet = await api('/api/laporan/signers');
const signersBody = await signersGet.json();
log('GET /api/laporan/signers', {
  status: signersGet.status,
  count: signersBody.data?.length,
  rows: (signersBody.data ?? []).map((row) => `${row.role}:${row.name}:${row.isDefault ? 'default' : '-'}`),
});

const createSigner = await api('/api/laporan/signers', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    role: 'DIBUAT',
    name: '[TEST] Penanda Tangan Uji',
    position: 'Tester',
    department: 'QA Internal',
    sortOrder: 99,
  }),
});
const createBody = await createSigner.json();
const testSignerId = createBody.data?.id;
log('POST /api/laporan/signers', { status: createSigner.status, success: createBody.success, id: testSignerId, message: createBody.message });

if (testSignerId) {
  const updateSigner = await api(`/api/laporan/signers/${testSignerId}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ position: 'Tester Senior' }),
  });
  const updateBody = await updateSigner.json();
  log('PUT /api/laporan/signers/:id', { status: updateSigner.status, position: updateBody.data?.position });

  const deleteSigner = await api(`/api/laporan/signers/${testSignerId}`, { method: 'DELETE' });
  const deleteBody = await deleteSigner.json();
  log('DELETE /api/laporan/signers/:id', { status: deleteSigner.status, success: deleteBody.success });
  result.testSignerId = testSignerId;
  result.testSignerDeleted = deleteSigner.ok;
}

// 7. Arsip ke Drive.
if (laporanId) {
  const selesaiResponse = await api(`/api/laporan/${laporanId}/selesai`, { method: 'POST' });
  const selesaiBody = await selesaiResponse.json();
  log('POST /api/laporan/:id/selesai', {
    status: selesaiResponse.status,
    success: selesaiBody.success,
    message: selesaiBody.message,
    file: selesaiBody.data?.file,
    status_after: selesaiBody.data?.laporan?.status,
    previousFileRemoved: selesaiBody.data?.previousFileRemoved,
  });
  result.laporanId = laporanId;
  result.driveFileId = selesaiBody.data?.file?.id;
  result.driveLink = selesaiBody.data?.file?.link;
  result.driveFileName = selesaiBody.data?.file?.name;
  if (!selesaiResponse.ok) result.errors.push('selesai/upload gagal: ' + JSON.stringify(selesaiBody).slice(0, 300));
}

writeFileSync(resolve(OUT, 'verify-api.json'), JSON.stringify(result, null, 2));
console.log('\n== ringkasan ==');
console.log('errors:', result.errors.length ? result.errors : 'tidak ada');
console.log('laporanId:', result.laporanId, '| driveFileId:', result.driveFileId);
if (result.errors.length) process.exitCode = 1;
