// Menyiapkan template laporan bulanan dari file contoh (contoh-laporan-bulanan.docx).
//
// Pendekatan: BUKAN membangun ulang dokumen. File contoh dipakai apa adanya
// (logo cover, header, footer, style, margin, font), lalu HANYA isi <w:t> yang
// diganti tag docxtemplater, plus beberapa paragraf/baris contoh dilepas supaya
// bisa di-loop. Semua operator XML lain (tcPr, tblGrid, vMerge, gridSpan, rPr,
// pPr, border) tidak disentuh — itu yang membuat layout tetap identik.
//
// Jalankan: node scripts/laporan/build-template.mjs
// Output : templates/laporan-bulanan.docx
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const PizZip = require('pizzip');

const ROOT = resolve(import.meta.dirname, '../..');
const SOURCE = resolve(ROOT, '../laporan-generator/reference/contoh-laporan-bulanan.docx');
const OUTPUT = resolve(ROOT, 'templates/laporan-bulanan.docx');

const zip = new PizZip(readFileSync(SOURCE));
const xml = zip.file('word/document.xml').asText();

// --------------------------------------------------------------- XML utils
function xmlEscape(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeRe(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Semua elemen `<tag ...>...</tag>` (sadar nesting) dalam rentang tertentu. */
function scanElements(source, tag, from = 0, to = source.length) {
  const result = [];
  const boundaryRe = new RegExp(`<${tag}(?=[\\s/>])|</${tag}>`, 'g');
  boundaryRe.lastIndex = from;
  let depth = 0;
  let start = -1;
  let match;
  while ((match = boundaryRe.exec(source))) {
    if (match.index >= to) break;
    const isClose = match[0] === `</${tag}>`;
    if (!isClose) {
      const arrow = source.indexOf('>', match.index);
      const selfClosing = source[arrow - 1] === '/';
      if (depth === 0) start = match.index;
      if (selfClosing) {
        if (depth === 0) result.push({ start, end: arrow + 1 });
        boundaryRe.lastIndex = arrow;
        continue;
      }
      depth += 1;
      boundaryRe.lastIndex = arrow;
    } else {
      depth -= 1;
      if (depth === 0) result.push({ start, end: match.index + `</${tag}>`.length });
    }
  }
  if (depth !== 0) throw new Error(`XML tidak seimbang untuk <${tag}>`);
  return result;
}

const bodyStart = xml.indexOf('<w:body>') + '<w:body>'.length;
const bodyEnd = xml.lastIndexOf('</w:body>');

const tableElements = scanElements(xml, 'w:tbl', bodyStart, bodyEnd).map((r) => ({ ...r, kind: 'tbl' }));
// Paragraf di dalam tabel tidak dihitung sebagai P<n> (sama seperti cara pandang
// Word: sel tabel bukan blok body). Ini menjaga penomoran P0..Pn stabil.
const paragraphElements = scanElements(xml, 'w:p', bodyStart, bodyEnd)
  .filter((p) => !tableElements.some((t) => p.start >= t.start && p.end <= t.end))
  .map((r) => ({ ...r, kind: 'p' }));

const elements = [...paragraphElements, ...tableElements].sort((a, b) => a.start - b.start);

let pCount = -1;
let tCount = -1;
for (const el of elements) {
  el.label = el.kind === 'p' ? `P${(pCount += 1)}` : `T${(tCount += 1)}`;
}
const byLabel = new Map(elements.map((el) => [el.label, el]));

const slice = (label) => {
  const el = byLabel.get(label);
  if (!el) throw new Error(`elemen ${label} tidak ditemukan`);
  return xml.slice(el.start, el.end);
};

const firstText = (label) => {
  const match = slice(label).match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/);
  if (!match) throw new Error(`${label}: tidak ada <w:t>`);
  return match[1];
};

// ------------------------------------------------------------------- edits
const edits = [];
const applied = [];

function findNthText(source, from, to, candidate, occurrence) {
  const re = new RegExp(`<w:t(?:\\s[^>]*)?>${escapeRe(candidate)}</w:t>`, 'g');
  re.lastIndex = from;
  let seen = 0;
  let m;
  while ((m = re.exec(source)) && m.index < to) {
    seen += 1;
    if (seen === occurrence) return m;
  }
  return null;
}

function pushText(label, oldText, newText, occurrence = 1) {
  const el = byLabel.get(label);
  // Nilai di XML sudah di-escape (& → &amp;); coba bentuk mentah lalu bentuk escape.
  const candidates = [...new Set([oldText, xmlEscape(oldText)])];
  let hit = null;
  let usedText = oldText;
  for (const candidate of candidates) {
    hit = findNthText(xml, el.start, el.end, candidate, occurrence);
    if (hit) {
      usedText = candidate;
      break;
    }
  }
  if (!hit) {
    throw new Error(`${label}: teks ${JSON.stringify(oldText)} ke-${occurrence} tidak ditemukan`);
  }
  const openTag = hit[0].slice(0, hit[0].indexOf('>') + 1);
  const start = hit.index + openTag.length;
  edits.push({ start, end: start + usedText.length, replacement: xmlEscape(newText), note: `${label}: ${oldText.slice(0, 40)}` });
  applied.push(`${label}  ${JSON.stringify(oldText.slice(0, 50))}  ->  ${JSON.stringify(newText)}`);
}

/** Ganti seluruh teks paragraf menjadi satu tag (teks run lain dikosongkan). */
function pushParagraphTag(label, tagText) {
  const el = byLabel.get(label);
  const re = /(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g;
  let count = 0;
  let m;
  const localEdits = [];
  while ((m = re.exec(xml)) && m.index < el.end) {
    if (m.index < el.start) continue;
    count += 1;
    const openLen = m[1].length;
    const start = m.index + openLen;
    localEdits.push({
      start,
      end: start + m[2].length,
      replacement: count === 1 ? xmlEscape(tagText) : '',
      note: `${label} teks ke-${count}`,
    });
  }
  if (count === 0) throw new Error(`${label}: paragraf tanpa <w:t>`);
  edits.push(...localEdits);
  applied.push(`${label}  (${count} run)  ->  ${JSON.stringify(tagText)}`);
}

/** Ganti potongan teks (bukan seluruh isi <w:t>) di dalam satu elemen. */
function pushSubstring(label, oldText, newText) {
  const el = byLabel.get(label);
  const candidates = [...new Set([oldText, xmlEscape(oldText)])];
  let index = -1;
  let used = oldText;
  for (const candidate of candidates) {
    const found = xml.indexOf(candidate, el.start);
    if (found !== -1 && found < el.end) {
      index = found;
      used = candidate;
      break;
    }
  }
  if (index === -1) throw new Error(`${label}: potongan teks ${JSON.stringify(oldText)} tidak ditemukan`);
  edits.push({
    start: index,
    end: index + used.length,
    replacement: xmlEscape(newText),
    note: `${label}: potongan ${oldText.slice(0, 30)}`,
  });
  applied.push(`${label}  substring ${JSON.stringify(oldText)}  ->  ${JSON.stringify(newText)}`);
}

function pushTextAll(oldText, newText, expected, tag) {
  const re = new RegExp(`<w:t(?:\\s[^>]*)?>${escapeRe(oldText)}</w:t>`, 'g');
  const matches = [...xml.matchAll(re)];
  if (matches.length !== expected) {
    throw new Error(`teks ${JSON.stringify(oldText)} muncul ${matches.length}×, diharapkan ${expected}×`);
  }
  for (const m of matches) {
    const openTag = m[0].slice(0, m[0].indexOf('>') + 1);
    const start = m.index + openTag.length;
    edits.push({ start, end: start + oldText.length, replacement: xmlEscape(newText), note: tag });
  }
  applied.push(`${tag}  (${expected}×)  ${JSON.stringify(oldText.slice(0, 50))}  ->  ${JSON.stringify(newText)}`);
}

function pushReplaceElement(label, replacement) {
  const el = byLabel.get(label);
  edits.push({ start: el.start, end: el.end, replacement, note: `replace ${label}` });
  applied.push(`replace ${label}`);
}

function pushRemove(label) {
  const el = byLabel.get(label);
  edits.push({ start: el.start, end: el.end, replacement: '', note: `remove ${label}` });
  applied.push(`remove ${label}`);
}

// ------------------------------------------------------- 1) Cover (textbox)
pushTextAll('Pekerjaan Jasa Joint Development ', '{project}', 2, 'cover');
pushTextAll('Digitalisasi Aplikasi  Human Capital Operations', '', 2, 'cover');
pushTextAll('SPPH 6557', '{docNo}', 2, 'cover');
pushTextAll('Periode 04 September - 03 Oktober 2026', 'Periode {period}', 3, 'cover');

// --------------------------------------------------- 2) Tabel info cover T0
pushText('T0', 'Pengadaan Pekerjaan Joint Development Digitalisasi ', '{project}');
pushText('T0', 'Aplikasi Human Capital Operations', '');
pushText('T0', '2496/Eks-BEST/BA/PBOE-272/X/202', '{docNo}');
pushText(
  'T0',
  'Laporan Pekerjaan Jasa Joint Developtment Digitalisasi Aplikasi Human Capital Operations ',
  '{title} '
);
// "Periode ..." di T0 sudah diganti oleh pushTextAll di atas.

// ------------------------------------------- 3) Riwayat perubahan (loop baris)
pushText('T1', '1.0', '{#revisions}{versi}');
pushText('T1', 'Satria Mulya Adiwardana', '{nama}');
pushText('T1', '5 Oktober 2026', '{tanggal}');
pushText('T1', 'Dokumen Awal', '{keterangan}{/revisions}');

// ------------------------------------------ 4) Pernyataan lembar persetujuan
pushText(
  'P9',
  'disetujui dan disepakati sebagai Laporan Pekerjaan Jasa Joint Developtment Digitalisasi Aplikasi Human Capital Operations',
  'disetujui dan disepakati sebagai {title}'
);

// --------------------------------- 5) Lembar persetujuan T2 (isi sel saja)
pushText('T2', '5 Oktober 2026', '{tanggal}', 1);
pushText('T2', '5 Oktober 2026', '{tanggal}', 2);
pushText('T2', '5 Oktober 2026', '{tanggal}', 3);
pushText('T2', 'Programmer Web', '{dibuatJabatan}');
pushText('T2', 'PT Bukit Energi Servis Terpadu', '{dibuatInstansi}', 1);
pushText('T2', 'Programming Staff', '{diperiksaJabatan}');
pushText('T2', 'PT Bukit Asam (Persero) Tbk', '{diperiksaInstansi}', 1);
pushText('T2', 'Satria Mulya Adiwardana', '{dibuatNama}');
pushText('T2', 'Zulfikar Murakabiman', '{diperiksaNama}');
pushText('T2', 'Direktur', '{disetujuiJabatan}');
pushText('T2', 'PT Bukit Energi Servis Terpadu', '{disetujuiInstansi}', 2);
pushText('T2', 'Application Development & Services/EIS Department Head', '{disetujui2Jabatan}');
pushText('T2', 'PT Bukit Asam (Persero) Tbk', '{disetujui2Instansi}', 2);
pushText('T2', 'Zulkurniadi', '{disetujuiNama}');
pushText('T2', 'Dedek Apriyani', '{disetujui2Nama}');

// ------------------------------------------------- 6) Pendahuluan (loop blok)
pushParagraphTag('P86', '{#intro}');
pushParagraphTag('P87', '{text}');
pushParagraphTag('P88', '{/intro}');

// ------------------------------------------------ 7) Ruang lingkup (loop bullet)
pushParagraphTag('P91', '{#scope}');
pushParagraphTag('P92', '{text}');
pushParagraphTag('P93', '{/scope}');
pushRemove('P94');
pushRemove('P95');

// ------------------------------------------------------ 8) TOC & daftar gambar
function fieldParagraph(sourceLabel, instruction, placeholder) {
  const source = slice(sourceLabel);
  const pPrStart = source.indexOf('<w:pPr>');
  const pPrEnd = source.indexOf('</w:pPr>') + '</w:pPr>'.length;
  const pPr = source.slice(pPrStart, pPrEnd);
  const rPrMatch = pPr.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
  const rPr = rPrMatch ? rPrMatch[0] : '';
  return (
    `<w:p>${pPr}<w:fldSimple w:instr=" ${instruction} "><w:r>${rPr}` +
    `<w:t xml:space="preserve">${xmlEscape(placeholder)}</w:t></w:r></w:fldSimple></w:p>`
  );
}

// Daftar Isi contoh ada di dalam content control (<w:sdt>) dan field TOC-nya
// membentang P13..P34 (begin di P13, end di P34). Seluruh blok itu diganti satu
// paragraf field supaya tidak ada sisa fldChar "end" menggantung.
const sdtRanges = scanElements(xml, 'w:sdt', bodyStart, bodyEnd);
const tocSdt = sdtRanges.find(
  (s) => byLabel.get('P13').start >= s.start && byLabel.get('P13').end <= s.end
);
if (!tocSdt) throw new Error('blok sdt daftar isi tidak ditemukan');
edits.push({
  start: tocSdt.start,
  end: tocSdt.end,
  replacement: fieldParagraph(
    'P13',
    'TOC \\o &quot;1-3&quot; \\h \\z \\u',
    'Daftar isi belum diperbarui. Tekan Ctrl+A lalu F9 di Word untuk memuat daftar isi.'
  ),
  note: 'ganti blok sdt daftar isi',
});
applied.push('replace blok sdt daftar isi -> paragraf field TOC');

pushReplaceElement(
  'P37',
  fieldParagraph(
    'P37',
    'TOC \\h \\z \\c &quot;Figure&quot;',
    'Daftar gambar belum diperbarui. Tekan Ctrl+A lalu F9 di Word untuk memuat daftar gambar.'
  )
);
for (let i = 38; i <= 82; i += 1) pushRemove(`P${i}`);

// ------------------------------------- 9) Tabel laporan pekerjaan (loop baris)
function rowsOf(tableLabel) {
  const table = byLabel.get(tableLabel);
  return scanElements(xml, 'w:tr', table.start, table.end).map((row) => xml.slice(row.start, row.end));
}

/** Buang w:vMerge supaya tiap baris loop berdiri sendiri (merge dibiarkan di header). */
function stripVerticalMerge(fragment) {
  return fragment.replace(/<w:vMerge[^>]*\/>/g, '');
}

function replaceInFragment(fragment, oldText, newText, occurrence = 1) {
  const re = new RegExp(`(<w:t(?:\\s[^>]*)?>)${escapeRe(oldText)}(</w:t>)`, 'g');
  let seen = 0;
  let hit = false;
  const out = fragment.replace(re, (whole, open, close) => {
    seen += 1;
    if (seen !== occurrence) return whole;
    hit = true;
    return `${open}${xmlEscape(newText)}${close}`;
  });
  if (!hit) throw new Error(`teks ${JSON.stringify(oldText)} tidak ditemukan di fragmen`);
  return out;
}

/** Isi satu sel: semua <w:t> lama dikosongkan, sel pertama diberi tag. */
function setCellTag(cellXml, tagText) {
  const textRe = /(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g;
  let count = 0;
  const withTag = cellXml.replace(textRe, (whole, open, _text, close) => {
    count += 1;
    return count === 1 ? `${open}${xmlEscape(tagText)}${close}` : `${open}${close}`;
  });
  if (count > 0) return withTag;

  // Sel tanpa <w:t> sama sekali: tambahkan teks ke run pertama, atau run baru.
  const paragraph = scanElements(withTag, 'w:p', 0, withTag.length)[0];
  if (!paragraph) throw new Error('sel tanpa paragraf');
  const paragraphXml = withTag.slice(paragraph.start, paragraph.end);
  const runMatch = paragraphXml.match(/<w:r>[\s\S]*?<\/w:r>/);
  const patched = runMatch
    ? paragraphXml.replace(runMatch[0], `${runMatch[0].slice(0, -'</w:r>'.length)}<w:t xml:space="preserve">${xmlEscape(tagText)}</w:t></w:r>`)
    : paragraphXml.replace('</w:p>', `<w:r><w:t xml:space="preserve">${xmlEscape(tagText)}</w:t></w:r></w:p>`);
  return withTag.slice(0, paragraph.start) + patched + withTag.slice(paragraph.end);
}

/** Bentuk ulang satu sel: bersihkan vMerge lalu tulis tag. */
function rebuildCell(cellXml, tagText) {
  return setCellTag(stripVerticalMerge(cellXml), tagText);
}

function rebuildRow(rowXml, tags) {
  const cells = scanElements(rowXml, 'w:tc', 0, rowXml.length);
  if (cells.length !== tags.length) {
    throw new Error(`jumlah sel ${cells.length} != jumlah tag ${tags.length}`);
  }
  let out = '';
  let cursor = 0;
  cells.forEach((cell, index) => {
    out += rowXml.slice(cursor, cell.start);
    out += rebuildCell(rowXml.slice(cell.start, cell.end), tags[index]);
    cursor = cell.end;
  });
  return out + rowXml.slice(cursor);
}

function rebuildTable(tableLabel, loopTags, fallbackTags) {
  const table = byLabel.get(tableLabel);
  const tableXml = slice(tableLabel);
  const rowRanges = scanElements(tableXml, 'w:tr', 0, tableXml.length);
  const rows = rowRanges.map((row) => tableXml.slice(row.start, row.end));

  const header = rows[0];
  const loopRow = rebuildRow(rows[1], loopTags);
  const fallbackRow = rebuildRow(rows[2], fallbackTags);

  return {
    replacement:
      tableXml.slice(0, rowRanges[0].start) +
      header +
      loopRow +
      fallbackRow +
      tableXml.slice(rowRanges[rowRanges.length - 1].end),
    start: table.start,
    end: table.end,
  };
}

// T3: Pengembangan Aplikasi (APLIKASI | STATUS PROGRESS | ACTION | PROGRESS)
// Kalimat pengantar tabel masih menyebut bulan contoh → dibuat dinamis.
pushText('P101', 'Untuk Bulan Juni 2026, berikut daftar pekerjaan yang telah dilakukan oleh tim SDM:', 'Untuk periode {period}, berikut daftar pekerjaan yang telah dilakukan oleh tim SDM:');
const devTable = rebuildTable(
  'T3',
  ['{#items}{modul}', '{status}', '{fitur}', '{percent}{/items}'],
  ['{^items}{modul}', '{status}', 'Tidak ada data pada periode ini.', '{percent}{/items}']
);
edits.push({ ...devTable, note: 'rebuild T3' });
applied.push('rebuild T3 (loop items)');

// T4: Pemeliharaan Aplikasi (APLIKASI | ACTION | PROGRESS)
const maintTable = rebuildTable(
  'T4',
  ['{#maintenanceItems}{modul}', '{fitur}', '{percent}{/maintenanceItems}'],
  ['{^maintenanceItems}{modul}', 'Tidak ada data pada periode ini.', '{percent}{/maintenanceItems}']
);
edits.push({ ...maintTable, note: 'rebuild T4' });
applied.push('rebuild T4 (loop maintenanceItems)');

// ----------------------------------------------------------- 10) Lampiran gambar
// Loop modul memakai paragraf penanda sendiri: kalau tag digabung di paragraf
// heading, salinan hasil loop kehilangan pPr (heading jadi paragraf biasa).
const headingPPr = (() => {
  const source = slice('P106');
  return source.slice(source.indexOf('<w:pPr>'), source.indexOf('</w:pPr>') + '</w:pPr>'.length);
})();
const tagParagraph = (tag) => `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(tag)}</w:t></w:r></w:p>`;
pushReplaceElement(
  'P106',
  tagParagraph('{#appendix}') + `<w:p>${headingPPr}<w:r><w:t xml:space="preserve">{modul}</w:t></w:r></w:p>` + tagParagraph('{#images}')
);
applied.push('P106 -> loop appendix + heading {modul}');

const imageParagraph = (() => {
  const source = slice('P107');
  const pPrEnd = source.indexOf('</w:pPr>') + '</w:pPr>'.length;
  return `${source.slice(0, pPrEnd)}<w:r><w:t xml:space="preserve">{%gambar}</w:t></w:r></w:p>`;
})();
pushReplaceElement('P107', imageParagraph);
applied.push('P107 -> {%%gambar}');

// Caption: "Figure " + SEQ field + "- {caption}"
const captionXml = (() => {
  let source = slice('P108');
  // Ganti nomor "1" (teks biasa) dengan field SEQ Figure supaya daftar gambar hidup.
  const runMatch = source.match(/<w:r>(?:(?!<\/w:r>)[\s\S])*?<w:t(?:\s[^>]*)?>1<\/w:t><\/w:r>/);
  if (!runMatch) throw new Error('run nomor caption tidak ditemukan');
  const rPrMatch = runMatch[0].match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
  const rPr = rPrMatch ? rPrMatch[0] : '';
  const field =
    `<w:r>${rPr}<w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r>${rPr}<w:instrText xml:space="preserve"> SEQ Figure \\* ARABIC </w:instrText></w:r>` +
    `<w:r>${rPr}<w:fldChar w:fldCharType="separate"/></w:r>` +
    `<w:r>${rPr}<w:t>1</w:t></w:r>` +
    `<w:r>${rPr}<w:fldChar w:fldCharType="end"/></w:r>`;
  source = source.replace(runMatch[0], field);
  source = replaceInFragment(source, '- form pengajuan SPPD Driver ', '- {caption}');
  return source;
})();
// Penutup loop: dua paragraf kosong bertag (dihapus docxtemplater saat render).
const closingParagraphs =
  '<w:p><w:r><w:t xml:space="preserve">{/images}</w:t></w:r></w:p>' +
  '<w:p><w:r><w:t xml:space="preserve">{/appendix}</w:t></w:r></w:p>';
pushReplaceElement('P108', captionXml + closingParagraphs);
applied.push('P108 -> caption + penutup loop');

// Sisa contoh lampiran (P109..P218) dibuang; P219 (paragraf penutup) dipertahankan.
for (let i = 109; i <= 218; i += 1) pushRemove(`P${i}`);

// ------------------------------------------------------------- apply edits
edits.sort((a, b) => b.start - a.start);
let previousStart = xml.length + 1;
let doc = xml;
for (const edit of edits) {
  if (edit.end > previousStart) {
    throw new Error(`edit tumpang tindih: ${edit.note} (${edit.start}-${edit.end}) vs ${previousStart}`);
  }
  doc = doc.slice(0, edit.start) + edit.replacement + doc.slice(edit.end);
  previousStart = edit.start;
}

// ------------------------------------------------- 11) updateFields di settings
let settings = zip.file('word/settings.xml').asText();
if (!settings.includes('<w:updateFields')) {
  settings = settings.replace('<w:footnotePr>', '<w:updateFields w:val="true" /><w:footnotePr>');
}
zip.file('word/settings.xml', settings);

// ------------------------------------------------------- 12) bersihkan media
// Hanya image relationship yang benar-benar masih dipakai yang disimpan.
const relsPath = 'word/_rels/document.xml.rels';
let rels = zip.file(relsPath).asText();
const usedIds = new Set([
  ...[...doc.matchAll(/r:embed="([^"]+)"/g)].map((m) => m[1]),
  ...[...doc.matchAll(/r:id="([^"]+)"/g)].map((m) => m[1]),
]);

const headerRels = zip.file('word/_rels/header1.xml.rels').asText();
const keepMedia = new Set(
  [...headerRels.matchAll(/Target="media\/([^"]+)"/g)].map((m) => `word/media/${m[1]}`)
);

let dropped = 0;
rels = rels.replace(/<Relationship\b[^>]*\/>/g, (rel) => {
  const idMatch = rel.match(/Id="([^"]+)"/);
  const typeMatch = rel.match(/Type="([^"]+)"/);
  const targetMatch = rel.match(/Target="([^"]+)"/);
  if (!idMatch || !typeMatch || !targetMatch) return rel;
  const isImage = typeMatch[1].endsWith('/image');
  if (!isImage) return rel;
  if (usedIds.has(idMatch[1])) {
    keepMedia.add(`word/${targetMatch[1]}`);
    return rel;
  }
  dropped += 1;
  return '';
});
zip.file(relsPath, rels);

let removedMedia = 0;
for (const name of Object.keys(zip.files)) {
  if (!name.startsWith('word/media/')) continue;
  if (keepMedia.has(name)) continue;
  zip.remove(name);
  removedMedia += 1;
}

zip.file('word/document.xml', doc);

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));

console.log('=== EDIT DITERAPKAN ===');
for (const line of applied) console.log(' -', line);
console.log(`\nrels gambar dibuang: ${dropped}`);
console.log(`file media dibuang  : ${removedMedia}`);
console.log(`ukuran template    : ${(readFileSync(OUTPUT).length / 1024).toFixed(1)} KB`);
console.log(`output             : ${OUTPUT}`);
