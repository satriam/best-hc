// Detail run-level untuk elemen tertentu: node scripts/laporan/inspect-detail.mjs <docx> <P0,P6,T0,T2,...>
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const PizZip = require('pizzip');
const { DOMParser } = require('@xmldom/xmldom');

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const V = 'urn:schemas-microsoft-com:vml';

const file = process.argv[2];
const wanted = (process.argv[3] || '').split(',').filter(Boolean);
const zip = new PizZip(readFileSync(file));
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
  const v = node.getAttributeNS(W, name);
  return v === null ? '' : v;
}
function walk(container, out) {
  for (let i = 0; i < container.childNodes.length; i += 1) {
    const node = container.childNodes[i];
    if (node.nodeType !== 1 || node.namespaceURI !== W) continue;
    if (node.localName === 'sdt') {
      const c = kids(node, 'sdtContent')[0];
      if (c) walk(c, out);
    } else out.push(node);
  }
  return out;
}

const elements = walk(body, []);
const label = (() => {
  let p = -1;
  let t = -1;
  const map = new Map();
  for (const el of elements) {
    if (el.localName === 'p') map.set(`P${(p += 1)}`, el);
    else if (el.localName === 'tbl') map.set(`T${(t += 1)}`, el);
  }
  return map;
})();

function describeRun(run) {
  const t = kids(run, 't').map((n) => n.textContent).join('');
  const drawings = run.getElementsByTagNameNS(W, 'drawing').length;
  const picts = run.getElementsByTagNameNS(W, 'pict').length;
  const breaks = [...run.getElementsByTagNameNS(W, 'br')].map((b) => attr(b, 'type') || 'line');
  const rPr = kids(run, 'rPr')[0];
  const bits = [];
  if (rPr) {
    if (kids(rPr, 'b')[0]) bits.push('b');
    if (kids(rPr, 'i')[0]) bits.push('i');
    const sz = kids(rPr, 'sz')[0];
    if (sz) bits.push('sz' + attr(sz, 'val'));
    const fonts = kids(rPr, 'rFonts')[0];
    if (fonts) bits.push('font:' + attr(fonts, 'ascii'));
    const color = kids(rPr, 'color')[0];
    if (color) bits.push('color:' + attr(color, 'val'));
    if (kids(rPr, 'vanish')[0]) bits.push('vanish');
  }
  const embeds = [...run.getElementsByTagNameNS(A, 'blip')].map((b) => b.getAttributeNS(R, 'embed'));
  const vml = [...run.getElementsByTagNameNS(V, 'imagedata')].map((b) => b.getAttributeNS(R, 'id'));
  return {
    text: t,
    img: drawings + picts,
    rel: [...embeds, ...vml].filter(Boolean),
    breaks,
    fmt: bits.join(' '),
  };
}

for (const key of wanted) {
  const el = label.get(key);
  if (!el) {
    console.log(`\n### ${key} TIDAK ADA`);
    continue;
  }
  console.log(`\n### ${key} (${el.localName})`);
  if (el.localName === 'p') {
    const pPr = kids(el, 'pPr')[0];
    const style = pPr && kids(pPr, 'pStyle')[0] ? attr(kids(pPr, 'pStyle')[0], 'val') : '';
    const jc = pPr && kids(pPr, 'jc')[0] ? attr(kids(pPr, 'jc')[0], 'val') : '';
    console.log(`  pStyle=${style} jc=${jc} pPr=${pPr ? pPr.toString().slice(0, 400) : '-'}`);
    kids(el, 'r').forEach((run, i) => {
      const d = describeRun(run);
      console.log(
        `  r${i} text=${JSON.stringify(d.text)} img=${d.img} rel=${d.rel.join('|')} breaks=${d.breaks.join('|')} fmt=[${d.fmt}]`
      );
    });
    const hyperlinks = kids(el, 'hyperlink');
    if (hyperlinks.length) console.log(`  hyperlinks=${hyperlinks.length}`);
  } else {
    kids(el, 'tr').forEach((row, ri) => {
      const trPr = kids(row, 'trPr')[0];
      const height = trPr && kids(trPr, 'trHeight')[0] ? attr(kids(trPr, 'trHeight')[0], 'val') : '';
      kids(row, 'tc').forEach((cell, ci) => {
        const tcPr = kids(cell, 'tcPr')[0];
        const w = tcPr && kids(tcPr, 'tcW')[0] ? attr(kids(tcPr, 'tcW')[0], 'w') : '';
        const gs = tcPr && kids(tcPr, 'gridSpan')[0] ? attr(kids(tcPr, 'gridSpan')[0], 'val') : '';
        const vm = tcPr && kids(tcPr, 'vMerge')[0] ? attr(kids(tcPr, 'vMerge')[0], 'val') || 'continue' : '';
        console.log(`  R${ri}C${ci} w=${w} gridSpan=${gs || '-'} vMerge=${vm || '-'} trHeight=${height || '-'}`);
        kids(cell, 'p').forEach((p, pi) => {
          const pPr = kids(p, 'pPr')[0];
          const style = pPr && kids(pPr, 'pStyle')[0] ? attr(kids(pPr, 'pStyle')[0], 'val') : '';
          const jc = pPr && kids(pPr, 'jc')[0] ? attr(kids(pPr, 'jc')[0], 'val') : '';
          const runs = kids(p, 'r').map((r, i) => {
            const d = describeRun(r);
            return `r${i}=${JSON.stringify(d.text)}${d.img ? ' [img]' : ''}${d.breaks.length ? ' [br:' + d.breaks.join(',') + ']' : ''}${d.fmt ? ' (' + d.fmt + ')' : ''}`;
          });
          console.log(`     p${pi} style=${style || '-'} jc=${jc || '-'} :: ${runs.join(' | ') || '(kosong)'}`);
        });
      });
    });
  }
}
