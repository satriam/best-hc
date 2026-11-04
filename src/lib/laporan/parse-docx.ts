import { DOMParser } from '@xmldom/xmldom';
import PizZip from 'pizzip';
import { ApiError } from '@/lib/api-error';
import { mimeFromBuffer } from '@/lib/laporan/images';
import type { LaporanMetaGuess, ParsedImage, ParsedModule, ParseResult } from '@/lib/laporan/types';

/**
 * Parser .docx mentah → materi laporan bulanan.
 *
 * Aturan (mengikuti generator Python yang sudah dipakai, lihat
 * `laporan-generator/laporan/parser.py`):
 * - Modul sebuah gambar = heading terdekat di atasnya (Heading 2, fallback
 *   Heading 1, lalu "Umum").
 * - Caption = paragraf berstyle `Caption`, teks `^(Figure|Gambar) N`, atau
 *   paragraf pendek tepat setelah gambar.
 * - Paragraf daftar isi / daftar gambar diabaikan karena hanya mengulang caption.
 * - Gambar diambil dari `word/media/*` lewat relasi `r:embed` / `r:id`.
 */

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const V = 'urn:schemas-microsoft-com:vml';

const CAPTION_RE = /^\s*(figure|gambar)\s*\.?\s*(\d+)\s*[-–—:.)]?\s*/i;
const TOC_STYLE_RE = /^(toc\s*\d|table of figures)/i;
const HEADING_RE = /^heading\s*(\d)/i;
const VERSION_RE = /(?:versi|version|v)\s*[:.]?\s*(\d+(?:\.\d+)+)/i;
const DATE_RE = /\b(\d{1,2})\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+(\d{4})\b/i;
const PERIOD_RANGE_RE = /periode\s+(\d{1,2}\s+[A-Za-z]+\s*[-–]\s*\d{1,2}\s+[A-Za-z]+\s+\d{4})/i;
const PERIOD_RE = /(?:bulan|periode)\s+([A-Za-z]+)\s+(\d{4})/i;

/** Batas aman jumlah gambar yang diproses dari satu file. */
const MAX_ITEMS = 300;
/** Panjang maksimal paragraf yang boleh dianggap caption. */
const MAX_CAPTION_LENGTH = 160;

interface RelInfo {
  type: string;
  target: string;
}

interface ParagraphImage {
  imageName: string;
  dataUrl: string;
  mimeType: string;
}

function parseXml(xml: string) {
  return new DOMParser().parseFromString(xml, 'text/xml');
}

function attr(element: Element, ns: string, name: string): string {
  const value = element.getAttributeNS(ns, name);
  return value === null ? '' : value;
}

function childElements(node: Element, localName: string): Element[] {
  const out: Element[] = [];
  for (let i = 0; i < node.childNodes.length; i += 1) {
    const child = node.childNodes[i];
    if (child.nodeType === 1) {
      const element = child as Element;
      if (element.namespaceURI === W && element.localName === localName) out.push(element);
    }
  }
  return out;
}

function allElements(node: Element, ns: string, localName: string): Element[] {
  const list = node.getElementsByTagNameNS(ns, localName);
  const out: Element[] = [];
  for (let i = 0; i < list.length; i += 1) out.push(list[i] as Element);
  return out;
}

function textOf(node: Element): string {
  return allElements(node, W, 't')
    .map((element) => element.textContent ?? '')
    .join('');
}

/** Body-level paragraphs, menembus content control (`w:sdt`). */
function collectBodyBlocks(body: Element): { paragraphs: Element[]; tables: Element[] } {
  const paragraphs: Element[] = [];
  const tables: Element[] = [];
  const walk = (container: Element) => {
    for (let i = 0; i < container.childNodes.length; i += 1) {
      const child = container.childNodes[i];
      if (child.nodeType !== 1) continue;
      const element = child as Element;
      if (element.namespaceURI !== W) continue;
      if (element.localName === 'sdt') {
        const content = childElements(element, 'sdtContent')[0];
        if (content) walk(content);
      } else if (element.localName === 'p') {
        paragraphs.push(element);
      } else if (element.localName === 'tbl') {
        tables.push(element);
      }
    }
  };
  walk(body);
  return { paragraphs, tables };
}

function readStyleNames(stylesXml: string | null): Map<string, string> {
  const names = new Map<string, string>();
  if (!stylesXml) return names;
  const styleRe = /<w:style\b[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g;
  let match: RegExpExecArray | null;
  while ((match = styleRe.exec(stylesXml))) {
    // Nama apa adanya: "Heading 1", "Caption", "toc 1", dst.
    const nameMatch = match[2].match(/<w:name w:val="([^"]+)"/);
    if (nameMatch) names.set(match[1], nameMatch[1]);
  }
  return names;
}

function readRels(relsXml: string | null): Map<string, RelInfo> {
  const rels = new Map<string, RelInfo>();
  if (!relsXml) return rels;
  const relRe = /<Relationship\b[^>]*Id="([^"]+)"[^>]*Type="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g;
  let match: RegExpExecArray | null;
  while ((match = relRe.exec(relsXml))) {
    rels.set(match[1], { type: match[2], target: match[3] });
  }
  return rels;
}

function paragraphStyleName(paragraph: Element, styleNames: Map<string, string>): string {
  const pPr = childElements(paragraph, 'pPr')[0];
  if (!pPr) return '';
  const pStyle = childElements(pPr, 'pStyle')[0];
  if (!pStyle) return '';
  const id = attr(pStyle, W, 'val');
  return styleNames.get(id) ?? '';
}

function paragraphImages(
  paragraph: Element,
  rels: Map<string, RelInfo>,
  zip: PizZip
): ParagraphImage[] {
  // Gambar di dalam kotak teks (textbox) adalah elemen desain cover/header —
  // bukan bukti pekerjaan. Tanpa filter ini, logo cover ikut jadi item lampiran.
  const decorative = new Set<Element>();
  for (const box of allElements(paragraph, W, 'txbxContent')) {
    for (const blip of allElements(box as Element, A, 'blip')) decorative.add(blip);
    for (const imageData of allElements(box as Element, V, 'imagedata')) decorative.add(imageData);
  }

  const ids: string[] = [];
  for (const blip of allElements(paragraph, A, 'blip')) {
    if (decorative.has(blip)) continue;
    const embed = attr(blip, R, 'embed');
    if (embed) ids.push(embed);
  }
  for (const imageData of allElements(paragraph, V, 'imagedata')) {
    if (decorative.has(imageData)) continue;
    const id = attr(imageData, R, 'id');
    if (id) ids.push(id);
  }

  const seen = new Set<string>();
  const images: ParagraphImage[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const rel = rels.get(id);
    if (!rel || !rel.type.endsWith('/image')) continue;
    const path = rel.target.startsWith('/') ? rel.target.slice(1) : `word/${rel.target}`;
    const file = zip.file(path) ?? zip.file(rel.target);
    if (!file) continue;
    const buffer = file.asNodeBuffer();
    if (buffer.length === 0) continue;
    const mimeType = mimeFromBuffer(buffer);
    images.push({
      imageName: path.split('/').pop() ?? path,
      mimeType,
      dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
    });
  }
  return images;
}

function cleanCaption(text: string): string {
  const cleaned = text.replace(CAPTION_RE, '').trim();
  return cleaned || text.trim();
}

function headingLevel(styleName: string): number {
  const match = styleName.match(HEADING_RE);
  return match ? Number(match[1]) : 1;
}

function guessMeta(tables: Element[], paragraphs: Element[]): LaporanMetaGuess {
  const guess: LaporanMetaGuess = {
    project: null,
    docNo: null,
    title: null,
    period: null,
    date: null,
    version: null,
  };

  const labels: Record<string, keyof LaporanMetaGuess> = {
    'nama proyek': 'project',
    proyek: 'project',
    project: 'project',
    'no dokumen': 'docNo',
    'nomor dokumen': 'docNo',
    'no. dokumen': 'docNo',
    'judul dokumen': 'title',
    judul: 'title',
    title: 'title',
  };

  const tableTexts: string[] = [];
  for (const table of tables) {
    const rows = allElements(table, W, 'tr');
    if (rows.length === 0) continue;
    const header = allElements(rows[0], W, 'tc').map((cell) => textOf(cell).trim().toLowerCase());
    const versionColumn = header.indexOf('versi');
    if (versionColumn >= 0 && rows.length > 1 && !guess.version) {
      const cells = allElements(rows[1], W, 'tc');
      if (versionColumn < cells.length) {
        guess.version = textOf(cells[versionColumn]).trim() || null;
      }
    }
    for (const row of rows) {
      const cells = allElements(row, W, 'tc').map((cell) => textOf(cell).trim());
      for (const value of cells) if (value) tableTexts.push(value);
      if (cells.length < 2) continue;
      const key = cells[0].replace(/:\s*$/, '').trim().toLowerCase();
      const target = labels[key];
      if (target && !guess[target] && cells[1]) {
        (guess[target] as string | null) = cells[1];
      }
    }
  }

  const corpus = [...paragraphs.map((p) => textOf(p).trim()), ...tableTexts]
    .filter((value) => value.length > 0)
    .join('\n');

  if (!guess.version) {
    const match = corpus.match(VERSION_RE);
    guess.version = match ? match[1] : null;
  }

  const approvalDate = tableTexts.find((value) => value.toLowerCase().startsWith('tanggal:'));
  if (approvalDate) {
    const match = approvalDate.match(DATE_RE);
    if (match) guess.date = `${match[1]} ${match[2]} ${match[3]}`;
  }
  if (!guess.date) {
    const match = corpus.match(DATE_RE);
    if (match) guess.date = `${match[1]} ${match[2]} ${match[3]}`;
  }

  if (!guess.period) {
    const range = corpus.match(PERIOD_RANGE_RE);
    if (range) {
      guess.period = range[1].replace(/\s*[-–]\s*/, ' - ');
    } else {
      const month = corpus.match(PERIOD_RE);
      if (month) {
        guess.period = `${month[1][0].toUpperCase()}${month[1].slice(1).toLowerCase()} ${month[2]}`;
      } else {
        const date = corpus.match(DATE_RE);
        if (date) guess.period = `${date[2]} ${date[3]}`;
      }
    }
  }

  return guess;
}

/**
 * Parse satu file .docx.
 *
 * @throws ApiError 400 bila file bukan .docx yang valid / terlalu banyak item.
 */
export function parseLaporanDocx(fileName: string, buffer: Buffer): ParseResult {
  let zip: PizZip;
  try {
    zip = new PizZip(buffer);
  } catch {
    throw new ApiError(`${fileName}: bukan file .docx yang valid (zip rusak)`, 400);
  }

  const documentXml = zip.file('word/document.xml')?.asText();
  if (!documentXml) {
    throw new ApiError(`${fileName}: bukan file .docx yang valid (word/document.xml tidak ada)`, 400);
  }

  const rels = readRels(zip.file('word/_rels/document.xml.rels')?.asText() ?? null);
  const styleNames = readStyleNames(zip.file('word/styles.xml')?.asText() ?? null);

  const document = parseXml(documentXml);
  const body = allElements(document as unknown as Element, W, 'body')[0];
  if (!body) throw new ApiError(`${fileName}: struktur dokumen tidak dikenali`, 400);

  const { paragraphs, tables } = collectBodyBlocks(body);

  const moduleIndex = new Map<string, ParsedModule>();
  const modules: ParsedModule[] = [];
  const narratives: string[] = [];
  const pending: ParsedImage[] = [];

  let currentH1: string | null = null;
  let currentH2: string | null = null;
  let inWorkReport = false;
  let headingCount = 0;
  let captionCount = 0;
  let skipped = 0;

  const bucketFor = (name: string): ParsedModule => {
    const moduleName = name || 'Umum';
    let bucket = moduleIndex.get(moduleName);
    if (!bucket) {
      bucket = { name: moduleName, items: [] };
      moduleIndex.set(moduleName, bucket);
      modules.push(bucket);
    }
    return bucket;
  };

  for (const paragraph of paragraphs) {
    const styleName = paragraphStyleName(paragraph, styleNames);
    const text = textOf(paragraph).trim();

    if (/^heading/i.test(styleName)) {
      pending.length = 0; // gambar langsung diikuti heading = tanpa caption
      if (text) {
        headingCount += 1;
        const level = headingLevel(styleName);
        if (level === 1) {
          currentH1 = text;
          currentH2 = null;
          inWorkReport = /laporan\s+pekerjaan/i.test(text);
          if (/lampiran/i.test(text)) inWorkReport = false;
        } else if (level === 2) {
          currentH2 = text;
        }
      }
      continue;
    }

    if (TOC_STYLE_RE.test(styleName)) continue;

    const images = paragraphImages(paragraph, rels, zip);
    if (images.length > 0) {
      // Belum ada heading sama sekali = masih area cover (logo/judul besar).
      if (!currentH1 && !currentH2) {
        skipped += images.length;
        continue;
      }
      const moduleName = currentH2 ?? currentH1 ?? 'Umum';
      for (const image of images) {
        const item: ParsedImage = {
          caption: '',
          imageName: image.imageName,
          mimeType: image.mimeType,
          dataUrl: image.dataUrl,
        };
        bucketFor(moduleName).items.push(item);
        pending.push(item);
      }
    }

    if (!text) continue;

    const isCaption = /^caption$/i.test(styleName) || CAPTION_RE.test(text);

    if (isCaption) {
      captionCount += 1;
      const caption = cleanCaption(text);
      if (pending.length > 0) {
        for (const item of pending) item.caption = caption;
        pending.length = 0;
      } else {
        bucketFor(currentH2 ?? currentH1 ?? 'Umum').items.push({
          caption,
          imageName: '',
          mimeType: 'image/png',
        });
      }
      continue;
    }

    if (pending.length > 0 && text.length <= MAX_CAPTION_LENGTH) {
      for (const item of pending) item.caption = text;
      pending.length = 0;
      continue;
    }

    if (pending.length > 0) pending.length = 0;

    if (inWorkReport && text.length >= 60 && !/^(figure|gambar)/i.test(text)) {
      if (!narratives.includes(text)) narratives.push(text);
    }
  }

  // Gambar tanpa caption bukan bukti pekerjaan yang bisa dilampirkan.
  const filtered: ParsedModule[] = [];
  for (const bucket of modules) {
    const before = bucket.items.length;
    const items = bucket.items.filter((item) => item.caption.trim().length > 0);
    skipped += before - items.length;
    if (items.length > 0) filtered.push({ ...bucket, items });
  }

  const totalItems = filtered.reduce((total, bucket) => total + bucket.items.length, 0);
  if (totalItems > MAX_ITEMS) {
    throw new ApiError(
      `${fileName}: terlalu banyak item (${totalItems}), batas ${MAX_ITEMS} per file`,
      422
    );
  }

  return {
    fileName,
    metaGuess: guessMeta(tables, paragraphs),
    modules: filtered,
    narratives: narratives.slice(0, 20),
    stats: {
      headings: headingCount,
      modules: filtered.length,
      items: totalItems,
      captions: captionCount,
      picturesSkipped: skipped,
      tables: tables.length,
    },
  };
}
