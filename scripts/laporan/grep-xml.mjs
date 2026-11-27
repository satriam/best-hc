import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const PizZip = require('pizzip');
const zip = new PizZip(readFileSync(process.argv[2]));
const xml = zip.file('word/document.xml').asText();
const needle = process.argv[3];
let i = -1;
let count = 0;
while ((i = xml.indexOf(needle, i + 1)) !== -1) {
  count += 1;
  console.log(`--- #${count} @${i}`);
  console.log(xml.slice(Math.max(0, i - 300), i + needle.length + 200));
  if (count >= Number(process.argv[4] || 3)) break;
}
console.log('total ditemukan (dibatasi):', count);
