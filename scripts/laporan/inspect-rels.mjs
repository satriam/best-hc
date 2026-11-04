// Cek detail pendukung: rels, settings, SEQ field, paragraf sel tabel.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const PizZip = require('pizzip');
const file = process.argv[2];
const zip = new PizZip(readFileSync(file));

console.log('=== word/_rels/document.xml.rels ===');
console.log(zip.file('word/_rels/document.xml.rels').asText().replace(/></g, '>\n<'));
console.log('\n=== word/_rels/header1.xml.rels ===');
console.log(zip.file('word/_rels/header1.xml.rels').asText());
console.log('\n=== word/settings.xml ===');
console.log(zip.file('word/settings.xml').asText().replace(/></g, '>\n<'));

const doc = zip.file('word/document.xml').asText();

// SEQ / field di caption Figure pertama
const captionIdx = doc.indexOf('Figure </w:t>');
console.log('\n=== sekitar caption pertama ===');
console.log(doc.slice(Math.max(0, captionIdx - 1500), captionIdx + 1200));

// R1 tabel pengembangan (C0 paragraf)
const tblIdx = doc.indexOf('APLIKASI');
console.log('\n=== potongan tabel pengembangan (R0/R1) ===');
console.log(doc.slice(tblIdx - 800, tblIdx + 5000));
