import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const PizZip = require('pizzip');
const zip = new PizZip(readFileSync(process.argv[2]));
const xml = zip.file(process.argv[3] || 'word/document.xml').asText();
const at = Number(process.argv[4] || 80000);
console.log(xml.slice(Math.max(0, at - 2500), at + 1500));
