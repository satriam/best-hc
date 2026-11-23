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

/**
 * Caption dengan penanda kategori di dalam bracket:
 * `Figure 3 [Reward & Punishment] - Halaman daftar ...` → module + title.
 */
const CAPTION_BRACKET_RE =
  /^\s*(?:gambar|figure)\s*\.?\s*(\d+)?\s*\[\s*([^\]]+?)\s*\]\s*[–—\-:]\s*(.+)$/i;
/** Caption tanpa bracket: `Gambar 4 – Formulir pengajuan` (modul dari heading). */
const CAPTION_PLAIN_RE = /^\s*(?:gambar|figure)\s*\.?\s*(\d+)\s*[–—\-:.)]\s*(.+)$/i;
/** Awalan caption untuk membersihkan teks bergaya `Caption` tanpa nomor. */
const CAPTION_PREFIX_RE = /^\s*(?:gambar|figure)\s*\.?\s*(\d+)?\s*/i;
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

/**
 * Bersihkan caption: buang awalan `Figure N`, penanda kategori `[...]`, tab +
 * nomor halaman (baris daftar gambar), dan pemisah sisa.
 */
function cleanCaption(text: string): string {
  return text
    .replace(/[\t]+\s*\d{1,4}\s*$/, '')
    .replace(/\s{3,}\d{1,4}\s*$/, '')
    .replace(/\t+/g, ' ')
    .replace(CAPTION_PREFIX_RE, '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s–—\-:.)|•]+/, '')
    .replace(/[\s–—\-:|•]+$/, '')
    .trim();
}

/** Kata sambung yang menandakan akhir nama modul pada awalan caption. */
const CAPTION_STOP_WORDS = new Set([
  'all', 'form', 'edit', 'template', 'document', 'preview', 'history', 'list',
  'detail', 'page', 'report', 'view', 'add', 'create', 'update', 'delete',
  'export', 'import', 'notifikasi', 'formulir', 'halaman', 'daftar', 'tambah',
  'ubah', 'hapus', 'cetak', 'laporan', 'untuk', 'for', 'pada', 'di',
]);

/**
 * Tebak nama modul dari awalan caption pada dokumen tanpa Heading, mis.
 * "Budget Control all feature" -> "Budget Control", "Tax Management preview
 * for xlsb" -> "Tax Management". Ambil deret kata Title-Case di depan sampai
 * ketemu kata sambung/aksi atau kata non-kapital; maksimal 3 kata.
 */
function moduleFromCaption(caption: string): string | null {
  // Tolak teks cover/boilerplate: "Prepared by", tahun ©/@, nama perusahaan.
  if (/prepared\s+by|@\s*\d{4}|©|bukit\s+energi|persero/i.test(caption)) return null;
  const words = caption.trim().split(/\s+/);
  const picked: string[] = [];
  for (const word of words) {
    const lower = word.toLowerCase().replace(/[^a-z]/g, '');
    if (picked.length > 0 && CAPTION_STOP_WORDS.has(lower)) break;
    // Modul = kata berawalan huruf kapital (Budget, Control, Tax, Management).
    if (!/^[A-Z]/.test(word)) break;
    picked.push(word);
    if (picked.length >= 3) break;
  }
  const name = picked.join(' ').trim();
  return name.length >= 2 ? name : null;
}

/** Header kolom tabel item pekerjaan yang dikenali (lower-case). */
const TABLE_HEADER_MODULE = ['aplikasi', 'modul', 'module', 'nama aplikasi', 'nama modul'];
const TABLE_HEADER_TITLE = ['deskripsi', 'action', 'fitur', 'kegiatan', 'description', 'pekerjaan', 'activity'];
const TABLE_HEADER_STATUS = ['progress', 'status', 'keterangan', 'progres'];
const TABLE_HEADER_PERCENT = ['persen', 'persentase', 'percent', '%', 'bobot'];

/** Teks satu sel tabel (gabungan semua paragraf, dirapikan). */
function cellText(cell: Element): string {
  return allElements(cell, W, 'p')
    .map((p) => textOf(p).trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface TableItem {
  module: string;
  title: string;
  status: string;
  percent: string;
}

/**
 * Ekstrak item pekerjaan dari tabel ber-header seperti:
 *   Aplikasi | Deskripsi | Progress      (atau Modul/Action/Status/Persen).
 * Mendukung kolom "Aplikasi" yang di-merge: sel kosong = modul sama dengan
 * baris di atasnya. Mengembalikan `null` kalau tabel bukan tabel item.
 */
function parseWorkTable(table: Element): TableItem[] | null {
  const rows = childElements(table, 'tr');
  if (rows.length < 2) return null;

  const headerCells = childElements(rows[0], 'tc').map((c) => cellText(c).toLowerCase());
  if (headerCells.length < 2) return null;

  const findCol = (candidates: string[]) =>
    headerCells.findIndex((h) => candidates.some((c) => h === c || h.includes(c)));

  const moduleCol = findCol(TABLE_HEADER_MODULE);
  const titleCol = findCol(TABLE_HEADER_TITLE);
  const statusCol = findCol(TABLE_HEADER_STATUS);
  const percentCol = findCol(TABLE_HEADER_PERCENT);

  // Minimal harus ada kolom judul/deskripsi; kalau tidak, ini bukan tabel item.
  if (titleCol < 0) return null;

  const items: TableItem[] = [];
  let lastModule = '';
  for (let i = 1; i < rows.length; i += 1) {
    const cells = childElements(rows[i], 'tc').map((c) => cellText(c));
    const title = (titleCol >= 0 ? cells[titleCol] : '') ?? '';
    if (!title.trim()) continue;
    let moduleName = (moduleCol >= 0 ? cells[moduleCol] : '') ?? '';
    if (moduleName.trim()) lastModule = moduleName.trim();
    else moduleName = lastModule; // sel modul di-merge/kosong -> pakai sebelumnya
    items.push({
      module: (moduleName || 'Umum').trim() || 'Umum',
      title: title.trim(),
      status: (statusCol >= 0 ? cells[statusCol] : '')?.trim() ?? '',
      percent: (percentCol >= 0 ? cells[percentCol] : '')?.trim() ?? '',
    });
  }
  return items.length > 0 ? items : null;
}

/** Urai caption menjadi modul (dari `[...]`), judul bersih, dan nomor gambar. */
function parseCaption(text: string): { module: string | null; title: string; figureNo: string | null } {
  const cleaned = text
    .replace(/[\t]+\s*\d{1,4}\s*$/, '')
    .replace(/\s{3,}\d{1,4}\s*$/, '')
    .trim();

  const bracket = cleaned.match(CAPTION_BRACKET_RE);
  if (bracket) {
    return {
      module: (bracket[2] ?? '').trim() || null,
      title: cleanCaption(bracket[3] ?? ''),
      figureNo: bracket[1] ?? null,
    };
  }

  const plain = cleaned.match(CAPTION_PLAIN_RE);
  if (plain) {
    return { module: null, title: cleanCaption(plain[2] ?? ''), figureNo: plain[1] ?? null };
  }

  return { module: null, title: cleanCaption(cleaned), figureNo: null };
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
  /** Gambar yang menunggu caption berikutnya (beserta modul asalnya). */
  const pending: { item: ParsedImage; module: string }[] = [];

  let currentH1: string | null = null;
  let currentH2: string | null = null;
  let inWorkReport = false;
  let headingCount = 0;
  let captionCount = 0;
  let skipped = 0;

  // Kunci modul dinormalkan (trim + spasi tunggal + lowercase) supaya modul
  // bernama sama persis (beda kapital/spasi) selalu digabung ke satu bucket;
  // nama tampil mengikuti kemunculan pertama.
  const moduleKey = (name: string) => (name || 'Umum').trim().replace(/\s+/g, ' ').toLowerCase();
  const bucketFor = (name: string): ParsedModule => {
    const display = (name || 'Umum').trim() || 'Umum';
    const key = moduleKey(display);
    let bucket = moduleIndex.get(key);
    if (!bucket) {
      bucket = { name: display, items: [] };
      moduleIndex.set(key, bucket);
      modules.push(bucket);
    }
    return bucket;
  };

  /** Pindahkan gambar ke modul lain (penanda `[Kategori]` pada caption). */
  const moveItem = (item: ParsedImage, fromModule: string, toModule: string) => {
    if (moduleKey(fromModule) === moduleKey(toModule)) return;
    const from = moduleIndex.get(moduleKey(fromModule));
    if (from) {
      from.items = from.items.filter((entry) => entry !== item);
      if (from.items.length === 0) {
        moduleIndex.delete(moduleKey(fromModule));
        const index = modules.indexOf(from);
        if (index >= 0) modules.splice(index, 1);
      }
    }
    bucketFor(toModule).items.push(item);
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
      // Dokumen tanpa Heading sama sekali (hanya [gambar] + baris caption tebal)
      // tetap diproses: gambar ditahan `pending`, modul/judul diambil dari baris
      // berikutnya. Logo cover dekoratif sudah disaring di paragraphImages, jadi
      // di sini tidak lagi dibuang buta hanya karena belum ada heading.
      const moduleName = currentH2 ?? currentH1 ?? 'Umum';
      for (const image of images) {
        const item: ParsedImage = {
          caption: '',
          title: '',
          module: moduleName,
          category: 'pengembangan',
          imageName: image.imageName,
          mimeType: image.mimeType,
          dataUrl: image.dataUrl,
        };
        bucketFor(moduleName).items.push(item);
        pending.push({ item, module: moduleName });
      }
    }

    if (!text) continue;

    const bracketMatch = text.match(CAPTION_BRACKET_RE);
    const plainMatch = bracketMatch ? null : text.match(CAPTION_PLAIN_RE);
    const isCaption = /^caption$/i.test(styleName) || Boolean(bracketMatch) || Boolean(plainMatch);

    if (isCaption) {
      captionCount += 1;
      const parsedCaption = parseCaption(text);
      // Modul: penanda `[Kategori]` lebih spesifik daripada heading terdekat.
      const targetModule = parsedCaption.module ?? currentH2 ?? currentH1 ?? 'Umum';

      if (pending.length > 0) {
        for (const entry of pending) {
          entry.item.caption = parsedCaption.title;
          entry.item.title = parsedCaption.title;
          entry.item.module = targetModule;
          entry.item.category = 'pengembangan';
          if (parsedCaption.figureNo) entry.item.figureNo = parsedCaption.figureNo;
          moveItem(entry.item, entry.module, targetModule);
        }
        pending.length = 0;
      } else {
        bucketFor(targetModule).items.push({
          caption: parsedCaption.title,
          title: parsedCaption.title,
          module: targetModule,
          category: 'pengembangan',
          ...(parsedCaption.figureNo ? { figureNo: parsedCaption.figureNo } : {}),
          imageName: '',
          mimeType: 'image/png',
        });
      }
      continue;
    }

    if (pending.length > 0 && text.length <= MAX_CAPTION_LENGTH) {
      const title = cleanCaption(text);
      const noHeadingYet = !currentH1 && !currentH2;
      const guessed = noHeadingYet ? moduleFromCaption(title) : null;

      // Dokumen tanpa Heading: hanya terima gambar yang caption-nya benar-benar
      // caption konten (menghasilkan modul Title-Case), BUKAN teks cover seperti
      // "Prepared by: ... @2019". Kalau gagal, gambar itu logo cover -> skip.
      if (noHeadingYet && !guessed) {
        // Gambar cover (logo) yang terlanjur masuk bucket: buang lagi.
        skipped += pending.length;
        for (const entry of pending) {
          const bucket = moduleIndex.get(moduleKey(entry.module));
          if (bucket) bucket.items = bucket.items.filter((it) => it !== entry.item);
        }
        pending.length = 0;
        continue;
      }

      for (const entry of pending) {
        entry.item.caption = title;
        entry.item.title = title;
        if (guessed && (entry.item.module === 'Umum' || !entry.item.module)) {
          entry.item.module = guessed;
          moveItem(entry.item, entry.module, guessed);
        }
      }
      pending.length = 0;
      continue;
    }

    if (pending.length > 0) pending.length = 0;

    if (inWorkReport && text.length >= 60 && !/^(figure|gambar)/i.test(text)) {
      if (!narratives.includes(text)) narratives.push(text);
    }
  }

  // Item dari TABEL pekerjaan (Aplikasi|Deskripsi|Progress dsb).
  // Hanya dibaca kalau dokumen BELUM menghasilkan item dari caption gambar —
  // dokumen yang punya caption lengkap (mis. contoh resmi) memakai gambar
  // sebagai bukti, tabelnya hanya ringkasan; menambah item tabel di situ akan
  // menggandakan. Dokumen berbasis-tabel (hanya tabel, tanpa caption) justru
  // butuh ini supaya modul & itemnya terbaca.
  // `captionCount` hanya menghitung caption SUNGGUHAN (bracket/plain/gaya
  // Caption), bukan tebakan baris tebal. Dokumen dengan caption sungguhan
  // memakai gambar sebagai bukti -> jangan gandakan dengan item tabel.
  let tableItemCount = 0;
  if (captionCount === 0) {
    for (const table of tables) {
      const tableItems = parseWorkTable(table);
      if (!tableItems) continue;
      for (const ti of tableItems) {
        bucketFor(ti.module).items.push({
          caption: ti.title,
          title: ti.title,
          module: ti.module,
          category: 'pengembangan',
          status: ti.status || undefined,
          percent: ti.percent || undefined,
          imageName: '',
          mimeType: '',
        });
        tableItemCount += 1;
      }
    }
  }

  // Kalau ada item tabel, modul "judul laporan" dari heading (mis. "Laporan per
  // September 2026") bukan modul nyata. Gambar tanpa caption di bawahnya
  // dipindah ke modul "Umum" supaya tidak hilang, lalu bucket judul dibuang.
  if (tableItemCount > 0) {
    for (const bucket of [...modules]) {
      if (!/^laporan\b|report\b/i.test(bucket.name)) continue;
      const orphanImages = bucket.items.filter((it) => it.dataUrl && !it.caption.trim());
      if (orphanImages.length === bucket.items.length && orphanImages.length > 0) {
        for (const img of orphanImages) {
          img.module = 'Umum';
          bucketFor('Umum').items.push(img);
        }
        const idx = modules.indexOf(bucket);
        if (idx >= 0) modules.splice(idx, 1);
        moduleIndex.delete(moduleKey(bucket.name));
      }
    }
  }

  // Item valid = punya caption (teks) ATAU gambar. Item tabel selalu bercaption.
  const filtered: ParsedModule[] = [];
  for (const bucket of modules) {
    const before = bucket.items.length;
    const items = bucket.items.filter((item) => item.caption.trim().length > 0 || item.dataUrl);
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
