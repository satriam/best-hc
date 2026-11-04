#!/usr/bin/env node
/**
 * Diagnostik XML template & hasil generate: field TOC, updateFields, gambar.
 * Jalankan: node scripts/laporan/inspect-fields.mjs [file.docx]
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PizZip from 'pizzip';

const ROOT = resolve(import.meta.dirname, '../..');
const target = resolve(process.cwd(), process.argv[2] ?? 'out/api-laporan.docx');
const zip = new PizZip(readFileSync(target));

console.log('file:', target);
const names = Object.keys(zip.files);
console.log('entries:', names.length, '| settings:', names.filter((n) => /settings|header|footer/.test(n)).join(', '));

const settings = zip.file('word/settings.xml')?.asText() ?? '';
console.log('\n-- updateFields occurrences --');
console.log(settings.match(/<w:updateFields[^>]*\/>/g) ?? 'TIDAK ADA');
console.log('settings tail:', settings.slice(-300));

const documentXml = zip.file('word/document.xml')?.asText() ?? '';
console.log('\n-- instrText (field codes) --');
for (const match of documentXml.matchAll(/<w:instrText[^>]*>([\s\S]*?)<\/w:instrText>/g)) {
  console.log('instrText:', JSON.stringify(match[1]));
}
console.log('\n-- fldSimple --');
for (const match of documentXml.matchAll(/<w:fldSimple[^>]*>([\s\S]{0,200})/g)) {
  console.log('fldSimple:', match[0].slice(0, 200).replace(/\s+/g, ' '));
}
console.log('\n-- gambar/Figure text --');
const texts = (documentXml.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>/g) ?? []).map((n) => n.replace(/<[^>]+>/g, ''));
console.log(texts.filter((t) => /figure|gambar|Gambar/i.test(t)).slice(0, 20));
