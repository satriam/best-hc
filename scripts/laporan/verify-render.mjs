// Verifikasi hasil generate vs template: layout tabel persetujuan, header, style,
// daftar heading, sisa placeholder, dan gambar.
// Jalankan: node scripts/laporan/verify-render.mjs <template.docx> <hasil.docx>
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const PizZip = require('pizzip');
const { DOMParser } = require('@xmldom/xmldom');

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const [templatePath, resultPath] = process.argv.slice(2);
if (!templatePath || !resultPath) {
  console.error('usage: verify-render.mjs <template.docx> <hasil.docx>');
  process.exit(1);
}

const templateZip = new PizZip(readFileSync(templatePath));
const resultZip = new PizZip(readFileSync(resultPath));
const templateXml = templateZip.file('word/document.xml').asText();
const resultXml = resultZip.file('word/document.xml').asText();

function dom(xml) {
  return new DOMParser().parseFromString(xml, 'text/xml');
}
function textOf(node) {
  const nodes = node.getElementsByTagNameNS(W, 't');
  let out = '';
  for (let i = 0; i < nodes.length; i += 1) out += nodes[i].textContent || '';
  return out;
}
function tablesOf(xml) {
  const doc = dom(xml);
  const tables = doc.getElementsByTagNameNS(W, 'tbl');
  const out = [];
  for (let i = 0; i < tables.length; i += 1) out.push(tables[i]);
  return out;
}
function approvalTable(tables) {
  return tables.find((t) => {
    const text = textOf(t);
    return text.includes('Disetujui Oleh') && t.getElementsByTagNameNS(W, 'tr').length === 11;
  });
}
function rowCount(table) {
  return table.getElementsByTagNameNS(W, 'tr').length;
}
function cellCounts(table) {
  const rows = table.getElementsByTagNameNS(W, 'tr');
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    out.push(rows[i].getElementsByTagNameNS(W, 'tc').length);
  }
  return out;
}
function gridCols(xml) {
  return [...xml.matchAll(/<w:gridCol[^>]*w:w="(\d+)"/g)].map((m) => m[1]);
}

const problems = [];
function check(name, ok, detail) {
  if (ok) {
    console.log(`OK   ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    problems.push(name);
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// --- 1) Logo & header tidak boleh berubah -----------------------------------
const templateLogo = templateZip.file('word/media/image1.png');
const resultLogo = resultZip.file('word/media/image1.png');
check(
  'logo cover (media/image1.png) ada & identik',
  Boolean(templateLogo && resultLogo) && templateLogo.asNodeBuffer().equals(resultLogo.asNodeBuffer()),
  resultLogo ? `${resultLogo.asNodeBuffer().length} byte` : 'hilang'
);
check(
  'word/header1.xml tidak berubah',
  templateZip.file('word/header1.xml').asText() === resultZip.file('word/header1.xml').asText()
);
check(
  'docProps/app.xml tidak berubah',
  templateZip.file('docProps/app.xml').asText() === resultZip.file('docProps/app.xml').asText()
);
const templateStyles = (templateZip.file('word/styles.xml').asText().match(/<w:style\b/g) || []).length;
const resultStyles = (resultZip.file('word/styles.xml').asText().match(/<w:style\b/g) || []).length;
check('jumlah style sama', templateStyles === resultStyles, `${templateStyles} vs ${resultStyles}`);
check(
  'settings.xml masih punya updateFields',
  /<w:updateFields w:val="true"\/>|<w:updateFields w:val="true" \/>/.test(resultZip.file('word/settings.xml').asText())
);

// --- 2) Tabel persetujuan: struktur XML harus identik -----------------------
const templateApproval = approvalTable(tablesOf(templateXml));
const resultApproval = approvalTable(tablesOf(resultXml));
check('tabel persetujuan ditemukan di hasil', Boolean(resultApproval));
if (templateApproval && resultApproval) {
  check('jumlah baris tabel persetujuan sama', rowCount(templateApproval) === rowCount(resultApproval), `${rowCount(resultApproval)} baris`);
  const tcTemplate = cellCounts(templateApproval).join(',');
  const tcResult = cellCounts(resultApproval).join(',');
  check('jumlah sel per baris sama', tcTemplate === tcResult, tcResult);
  check('gridSpan sama', (templateApproval.getElementsByTagNameNS(W, 'gridSpan').length) === (resultApproval.getElementsByTagNameNS(W, 'gridSpan').length));
  check('vMerge sama', (templateApproval.getElementsByTagNameNS(W, 'vMerge').length) === (resultApproval.getElementsByTagNameNS(W, 'vMerge').length));
  check(
    'trHeight tabel persetujuan sama',
    [...templateApproval.toString().matchAll(/<w:trHeight[^>]*w:val="(\d+)"/g)].map((m) => m[1]).join(',') ===
      [...resultApproval.toString().matchAll(/<w:trHeight[^>]*w:val="(\d+)"/g)].map((m) => m[1]).join(',')
  );

  // Hitung node <w:t> yang berbeda (hanya teks yang boleh berubah).
  const tplTexts = [...templateApproval.getElementsByTagNameNS(W, 't')].map((n) => {
    const node = n;
    return node.textContent || '';
  });
  const resTexts = [...resultApproval.getElementsByTagNameNS(W, 't')].map((n) => n.textContent || '');
  const changed = [];
  const max = Math.max(tplTexts.length, resTexts.length);
  for (let i = 0; i < max; i += 1) {
    if ((tplTexts[i] || '') !== (resTexts[i] || '')) changed.push([tplTexts[i], resTexts[i]]);
  }
  check('jumlah node <w:t> tabel persetujuan sama', tplTexts.length === resTexts.length, `${tplTexts.length} vs ${resTexts.length}`);
  console.log(`     node <w:t> berubah: ${changed.length} dari ${tplTexts.length}`);
  for (const [before, after] of changed) {
    console.log(`       ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  }
}

// --- 3) Tabel lain: grid sama ----------------------------------------------
const tplTables = tablesOf(templateXml);
const resTables = tablesOf(resultXml);
check('jumlah tabel sama', tplTables.length === resTables.length, `${resTables.length} tabel`);
const tplGrid = gridCols(templateXml);
const resGrid = gridCols(resultXml);
check('semua gridCol sama', tplGrid.join(',') === resGrid.join(','), resGrid.join('|'));

// --- 4) Gambar --------------------------------------------------------------
const resultMedia = Object.keys(resultZip.files).filter((n) => n.startsWith('word/media/'));
const resultDrawings = (resultXml.match(/<w:drawing>/g) || []).length;
console.log(`     media di hasil: ${resultMedia.length} file, <w:drawing> ${resultDrawings}`);

// --- 5) Placeholder ---------------------------------------------------------
const leftovers = (resultXml.match(/\{[#^/]?[A-Za-z][A-Za-z0-9_.]{0,40}\}/g) || []).filter(
  (token) => !/^\{[0-9A-F-]{36}\}$/.test(token)
);
check('tidak ada placeholder tersisa', leftovers.length === 0, leftovers.slice(0, 5).join(' '));
check('dua field TOC (daftar isi + daftar gambar) ada', (resultXml.match(/<w:fldSimple[^>]*w:instr=" TOC/g) || []).length === 2);

// --- 6) Urutan heading ------------------------------------------------------
function headings(xml) {
  const doc = dom(xml);
  const paragraphs = doc.getElementsByTagNameNS(W, 'p');
  const out = [];
  for (let i = 0; i < paragraphs.length; i += 1) {
    const p = paragraphs[i];
    const pPr = p.getElementsByTagNameNS(W, 'pStyle');
    if (!pPr.length) continue;
    const style = pPr[0].getAttributeNS(W, 'val');
    if (style === '912' || style === '913') out.push(`${style === '912' ? 'H1' : 'H2'}:${textOf(p).trim()}`);
  }
  return out;
}
const tplHeadings = headings(templateXml).filter((h) => !h.includes('{'));
const resHeadings = headings(resultXml);
console.log('     heading template (tanpa tag):', tplHeadings.length);
console.log('     heading hasil             :', resHeadings.length);
const mustKeep = ['H1:Lembar Persetujuan', 'H1:Riwayat Perubahan Dokumen', 'H1:Daftar Isi', 'H1:Daftar Gambar', 'H1:Ruang Lingkup Pekerjaan', 'H1:Lampiran Gambar'];
check(
  'heading wajib ada & berurutan',
  mustKeep.every((h, i) => resHeadings.indexOf(h) >= 0 && resHeadings.indexOf(h) < (resHeadings.indexOf(mustKeep[i + 1]) < 0 ? Infinity : resHeadings.indexOf(mustKeep[i + 1]))),
  resHeadings.join(' > ')
);

console.log('\n=== RINGKASAN ===');
console.log(`masalah: ${problems.length ? problems.join(', ') : 'tidak ada'}`);
process.exit(problems.length ? 1 : 0);
