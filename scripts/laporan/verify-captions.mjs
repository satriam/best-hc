#!/usr/bin/env node
/**
 * Dump paragraf lampiran (caption gambar) dari hasil generate untuk memastikan
 * teks caption + style konsisten dengan template.
 * Jalankan: node scripts/laporan/verify-captions.mjs [file.docx]
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PizZip from 'pizzip';
import { DOMParser } from '@xmldom/xmldom';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const file = resolve(process.cwd(), process.argv[2] ?? 'out/api-laporan.docx');
const zip = new PizZip(readFileSync(file));
const xml = zip.file('word/document.xml').asText();

// Peta styleId -> nama style.
const stylesXml = zip.file('word/styles.xml').asText();
const styleNames = new Map();
for (const match of stylesXml.matchAll(/<w:style\b[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g)) {
  const name = match[2].match(/<w:name w:val="([^"]+)"/);
  if (name) styleNames.set(match[1], name[1]);
}

const doc = new DOMParser().parseFromString(xml, 'text/xml');
const paragraphs = doc.getElementsByTagNameNS(W, 'p');

const rows = [];
for (let i = 0; i < paragraphs.length; i += 1) {
  const paragraph = paragraphs[i];
  const text = (() => {
    const nodes = paragraph.getElementsByTagNameNS(W, 't');
    let out = '';
    for (let j = 0; j < nodes.length; j += 1) out += nodes[j].textContent ?? '';
    return out;
  })();
  if (!/figure|gambar/i.test(text)) continue;
  const pStyle = paragraph.getElementsByTagNameNS(W, 'pStyle');
  const styleId = pStyle.length > 0 ? pStyle[0].getAttribute('w:val') : '';
  rows.push({
    styleId,
    styleName: styleNames.get(styleId) ?? '(default)',
    hasSeqField: /SEQ Figure/.test(
      Array.from(paragraph.getElementsByTagNameNS(W, 'instrText'))
        .map((node) => node.textContent ?? '')
        .join(' ')
    ),
    text: text.slice(0, 120),
  });
}

console.log('file:', file);
console.log('paragraf mengandung "figure/gambar":', rows.length);
for (const row of rows) {
  console.log(
    `[${row.styleId || '-'} | ${row.styleName}]${row.hasSeqField ? ' (SEQ)' : ''} ${row.text}`
  );
}
