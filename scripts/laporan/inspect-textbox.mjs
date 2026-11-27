// Dump isi text box (w:txbxContent) per paragraf terpilih.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const PizZip = require('pizzip');
const { DOMParser } = require('@xmldom/xmldom');

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const file = process.argv[2];
const keys = (process.argv[3] || 'P0').split(',');

const zip = new PizZip(readFileSync(file));
const dom = new DOMParser().parseFromString(zip.file('word/document.xml').asText(), 'text/xml');
const body = dom.getElementsByTagNameNS(W, 'body')[0];

function kids(node, localName) {
  const out = [];
  for (let i = 0; i < node.childNodes.length; i += 1) {
    const c = node.childNodes[i];
    if (c.nodeType === 1 && c.namespaceURI === W && c.localName === localName) out.push(c);
  }
  return out;
}
function walk(container, out) {
  for (let i = 0; i < container.childNodes.length; i += 1) {
    const n = container.childNodes[i];
    if (n.nodeType !== 1 || n.namespaceURI !== W) continue;
    if (n.localName === 'sdt') {
      const c = kids(n, 'sdtContent')[0];
      if (c) walk(c, out);
    } else out.push(n);
  }
  return out;
}
const elements = walk(body, []);
let p = -1;
const map = new Map();
for (const el of elements) if (el.localName === 'p') map.set(`P${(p += 1)}`, el);

for (const key of keys) {
  const el = map.get(key);
  if (!el) {
    console.log(`### ${key} tidak ada`);
    continue;
  }
  console.log(`\n### ${key} textboxes`);
  const boxes = el.getElementsByTagNameNS(W, 'txbxContent');
  console.log('jumlah txbxContent:', boxes.length);
  for (let b = 0; b < boxes.length; b += 1) {
    const paras = boxes[b].getElementsByTagNameNS(W, 'p');
    for (let i = 0; i < paras.length; i += 1) {
      const runs = kids(paras[i], 'r');
      const desc = runs.map((r, ri) => {
        const t = kids(r, 't').map((n) => n.textContent).join('');
        return `r${ri}=${JSON.stringify(t)}`;
      });
      const shapes = paras[i].getElementsByTagNameNS(W, 'drawing').length;
      if (desc.join('').replace(/r\d+=""/g, '').length > 0 || shapes > 0) {
        console.log(`  box${b} p${i} img=${shapes} :: ${desc.join(' | ')}`);
      }
    }
  }
}
