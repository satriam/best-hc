// Dump struktur .docx (paragraf + tabel + media) untuk analisis template.
// Pakai: node scripts/laporan/inspect-docx.mjs <path.docx>
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const PizZip = require('pizzip');
const { DOMParser } = require('@xmldom/xmldom');

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const file = process.argv[2];
if (!file) {
  console.error('usage: inspect-docx.mjs <path.docx>');
  process.exit(1);
}
const zip = new PizZip(readFileSync(file));
const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
console.log('=== FILES (' + names.length + ') ===');
for (const n of names) console.log(' ', n);

const docXml = zip.file('word/document.xml').asText();
const dom = new DOMParser().parseFromString(docXml, 'text/xml');
const body = dom.getElementsByTagNameNS(W, 'body')[0];

function kids(node, localName) {
  const out = [];
  for (let i = 0; i < node.childNodes.length; i += 1) {
    const child = node.childNodes[i];
    if (child.nodeType === 1 && child.namespaceURI === W && child.localName === localName) out.push(child);
  }
  return out;
}

function attr(node, name) {
  const value = node.getAttributeNS(W, name);
  return value === null ? '' : value;
}

function textOf(node) {
  const nodes = node.getElementsByTagNameNS(W, 't');
  let out = '';
  for (let i = 0; i < nodes.length; i += 1) out += nodes[i].textContent || '';
  return out;
}

function countTags(node, localName) {
  return node.getElementsByTagNameNS(W, localName).length;
}

function walkBody(container, out) {
  for (let i = 0; i < container.childNodes.length; i += 1) {
    const node = container.childNodes[i];
    if (node.nodeType !== 1 || node.namespaceURI !== W) continue;
    if (node.localName === 'sdt') {
      const content = kids(node, 'sdtContent')[0];
      if (content) walkBody(content, out);
    } else {
      out.push(node);
    }
  }
  return out;
}

const elements = walkBody(body, []);
console.log('\n=== BODY ELEMENTS', elements.length, '===');
let pIndex = -1;
let tIndex = -1;
for (const el of elements) {
  if (el.localName === 'p') {
    pIndex += 1;
    const pPr = kids(el, 'pPr')[0];
    const style = pPr ? (kids(pPr, 'pStyle')[0] ? attr(kids(pPr, 'pStyle')[0], 'val') : '') : '';
    const drawings = el.getElementsByTagNameNS(W, 'drawing').length + el.getElementsByTagNameNS(W, 'pict').length;
    console.log(
      `P${pIndex} style=${style || '-'} runs=${kids(el, 'r').length} img=${drawings} :: ${JSON.stringify(textOf(el).slice(0, 150))}`
    );
  } else if (el.localName === 'tbl') {
    tIndex += 1;
    const rows = kids(el, 'tr');
    const grid = kids(el, 'tblGrid')[0];
    const cols = grid ? kids(grid, 'gridCol').map((c) => attr(c, 'w')) : [];
    console.log(
      `T${tIndex} rows=${rows.length} gridCols=[${cols.join(',')}] gridSpan=${countTags(el, 'gridSpan')} vMerge=${countTags(el, 'vMerge')}`
    );
    rows.forEach((row, ri) => {
      const cells = kids(row, 'tc');
      const texts = cells.map((c) => textOf(c).slice(0, 60));
      const imgs = cells.map(
        (c) => c.getElementsByTagNameNS(W, 'drawing').length + c.getElementsByTagNameNS(W, 'pict').length
      );
      const paras = cells.map((c) => kids(c, 'p').length);
      const spans = cells.map((c) => {
        const pr = kids(c, 'tcPr')[0];
        const gs = pr ? kids(pr, 'gridSpan')[0] : null;
        const vm = pr ? kids(pr, 'vMerge')[0] : null;
        let tag = '';
        if (gs) tag += `span${attr(gs, 'val')}`;
        if (vm) tag += `v${attr(vm, 'val') || 'cont'}`;
        return tag;
      });
      console.log(
        `   R${ri} cells=${cells.length} paras=[${paras.join(',')}] img=[${imgs.join(',')}] span=[${spans.join(',')}] :: ` +
          texts.map((t) => JSON.stringify(t)).join(' | ')
      );
    });
  } else {
    console.log(`${el.localName.toUpperCase()} (len ${docXml.length})`);
  }
}

const styles = zip.file('word/styles.xml');
if (styles) {
  const s = styles.asText();
  const defs = [...s.matchAll(/<w:style\b[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g)];
  console.log('\n=== STYLES (' + defs.length + ') — hanya yang dipakai/umum ===');
  const wanted = new Set(['911', '912', '913', '921', '922', 'Caption', 'Caption1', 'TOC1', 'TOC2', 'TOC3', 'Footer', 'Header', 'ListParagraph', 'TableGrid']);
  for (const [, id, bodyXml] of defs) {
    const name = (bodyXml.match(/<w:name w:val="([^"]+)"/) || [])[1] || '';
    if (!wanted.has(id) && !/caption|toc|footer|header|normal|heading|list paragraph/i.test(name)) continue;
    const sz = (bodyXml.match(/<w:sz w:val="([^"]+)"/) || [])[1];
    const font = (bodyXml.match(/<w:rFonts[^>]*w:ascii="([^"]+)"/) || [])[1];
    console.log(`  ${id} name=${name} sz=${sz || '-'} font=${font || '-'}`);
  }
}

for (const headerName of names.filter((n) => /^word\/(header|footer)\d*\.xml$/.test(n))) {
  console.log(`\n=== ${headerName} ===`);
  console.log(zip.file(headerName).asText().slice(0, 1200));
}
