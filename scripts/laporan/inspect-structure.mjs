// Ringkasan body element (P/T) dengan penanda field, page break, dan sdt.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const PizZip = require('pizzip');
const zip = new PizZip(readFileSync(process.argv[2]));
const xml = zip.file('word/document.xml').asText();
const from = Number(process.argv[3] || 0);
const to = Number(process.argv[4] || 999);

function scanElements(source, tag, a, b) {
  const result = [];
  const re = new RegExp(`<${tag}(?=[\\s/>])|</${tag}>`, 'g');
  re.lastIndex = a;
  let depth = 0;
  let start = -1;
  let m;
  while ((m = re.exec(source))) {
    if (m.index >= b) break;
    const close = m[0] === `</${tag}>`;
    if (!close) {
      const arrow = source.indexOf('>', m.index);
      const self = source[arrow - 1] === '/';
      if (depth === 0) start = m.index;
      if (self) {
        if (depth === 0) result.push({ start, end: arrow + 1 });
        re.lastIndex = arrow;
        continue;
      }
      depth += 1;
      re.lastIndex = arrow;
    } else {
      depth -= 1;
      if (depth === 0) result.push({ start, end: m.index + `</${tag}>`.length });
    }
  }
  return result;
}

const bodyStart = xml.indexOf('<w:body>') + 8;
const bodyEnd = xml.lastIndexOf('</w:body>');
const tables = scanElements(xml, 'w:tbl', bodyStart, bodyEnd);
const paras = scanElements(xml, 'w:p', bodyStart, bodyEnd).filter(
  (p) => !tables.some((t) => p.start >= t.start && p.end <= t.end)
);
const sdtRanges = scanElements(xml, 'w:sdt', bodyStart, bodyEnd);
const elements = [
  ...paras.map((r) => ({ ...r, kind: 'p' })),
  ...tables.map((r) => ({ ...r, kind: 'tbl' })),
].sort((a, b) => a.start - b.start);

let p = -1;
let t = -1;
elements.forEach((el, i) => {
  el.label = el.kind === 'p' ? `P${(p += 1)}` : `T${(t += 1)}`;
  const idx = Number(el.label.slice(1));
  if (idx < from || idx > to) return;
  const frag = xml.slice(el.start, el.end);
  const style = (frag.match(/<w:pStyle w:val="([^"]+)"/) || [])[1] || '-';
  const text = [...frag.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join('');
  const begin = (frag.match(/fldCharType="begin"/g) || []).length;
  const end = (frag.match(/fldCharType="end"/g) || []).length;
  const sep = (frag.match(/fldCharType="separate"/g) || []).length;
  const inSdt = sdtRanges.find((s) => el.start >= s.start && el.end <= s.end);
  const pageBreak = /<w:br w:type="page"/.test(frag);
  console.log(
    `${el.label} kind=${el.kind} style=${style} b=${begin} s=${sep} e=${end} sdt=${inSdt ? 'yes' : '-'} pageBreak=${pageBreak} len=${frag.length} :: ${JSON.stringify(text.slice(0, 70))}`
  );
});
console.log('\nsdt ranges:');
for (const s of sdtRanges) console.log(' ', s.start, s.end, JSON.stringify(xml.slice(s.start, s.start + 200)));
