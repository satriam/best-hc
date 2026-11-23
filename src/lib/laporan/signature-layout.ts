/**
 * Ekstraksi tabel persetujuan (lembar tanda tangan) dari template resmi.
 *
 * Tabel ini tidak dibangun manual di UI: strukturnya dibaca langsung dari
 * `templates/laporan-bulanan.docx` (11 baris) supaya preview selalu sama dengan
 * dokumen yang dihasilkan. Dipakai `GET /api/laporan/signature-layout`.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import PizZip from 'pizzip';
import { ApiError } from '@/lib/api-error';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** 1 px = 15 twip (96 dpi), sama dengan hitungan UI (1323 twip ≈ 88 px). */
const TWIPS_PER_PX = 15;

const TEMPLATE_PATH = path.join(process.cwd(), 'templates', 'laporan-bulanan.docx');

export interface SignatureLayoutCell {
  text: string;
  colSpan: number;
  rowSpan: number;
  bold: boolean;
  align: string | null;
}

export interface SignatureLayoutRow {
  heightPx: number;
  cells: SignatureLayoutCell[];
}

export interface SignatureLayoutColumn {
  index: number;
  widthTwip: number;
  widthPx: number;
}

export interface SignatureLayout {
  /** Jumlah kolom grid tabel. */
  columnCount: number;
  columns: SignatureLayoutColumn[];
  rows: SignatureLayoutRow[];
  /** Tinggi minimum tabel dalam px (jumlah tinggi baris). */
  heightPx: number;
  source: string;
}

/** Nilai pengisi placeholder `{...}` pada sel tabel. */
export interface SignatureLayoutValues {
  dibuatNama?: string;
  dibuatJabatan?: string;
  dibuatInstansi?: string;
  diperiksaNama?: string;
  diperiksaJabatan?: string;
  diperiksaInstansi?: string;
  disetujuiNama?: string;
  disetujuiJabatan?: string;
  disetujuiInstansi?: string;
  disetujui2Nama?: string;
  disetujui2Jabatan?: string;
  disetujui2Instansi?: string;
  tanggal?: string;
}

function parseXml(xml: string) {
  return new DOMParser().parseFromString(xml, 'text/xml');
}

function childElements(node: Element, localName: string): Element[] {
  const out: Element[] = [];
  for (let i = 0; i < node.childNodes.length; i += 1) {
    const child = node.childNodes[i];
    if (child.nodeType === 1) {
      const element = child as Element;
      if (element.localName === localName && element.namespaceURI === W) out.push(element);
    }
  }
  return out;
}

function allElements(node: Element, localName: string): Element[] {
  const list = node.getElementsByTagNameNS(W, localName);
  const out: Element[] = [];
  for (let i = 0; i < list.length; i += 1) out.push(list[i] as Element);
  return out;
}

function attr(element: Element, name: string): string {
  const value = element.getAttributeNS(W, name);
  return value === null ? '' : value;
}

/** Teks satu sel: paragraf dipisah newline supaya jabatan/instansi tetap dua baris. */
function cellText(cell: Element): string {
  const paragraphs = allElements(cell, 'p');
  const lines = paragraphs
    .map((paragraph) =>
      allElements(paragraph, 't')
        .map((node) => node.textContent ?? '')
        .join('')
        .trim()
    )
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return allElements(cell, 't')
      .map((node) => node.textContent ?? '')
      .join('')
      .trim();
  }
  return lines.join('\n');
}

/** Isi placeholder `{tag}` dari nilai yang diberikan; tag tak dikenal → kosong. */
function substitute(text: string, values: SignatureLayoutValues): string {
  return text
    .replace(/\{([^{}]+)\}/g, (_match, rawTag: string) => {
      const tag = rawTag.trim();
      const value = (values as Record<string, string | undefined>)[tag];
      return typeof value === 'string' ? value : '';
    })
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function twipToPx(twips: number): number {
  return Math.round(twips / TWIPS_PER_PX);
}

/** Tabel persetujuan = tabel dengan "Dibuat Oleh" + "Disetujui Oleh". */
function findApprovalTable(documentXml: string): Element {
  const document = parseXml(documentXml);
  const body = allElements(document as unknown as Element, 'body')[0];
  if (!body) {
    throw new ApiError('Template laporan tidak berisi <w:body>', 500);
  }

  const tables = Array.from(body.getElementsByTagNameNS(W, 'tbl')) as Element[];
  for (const table of tables) {
    const plain = allElements(table, 't').map((node) => node.textContent ?? '').join(' ');
    const rows = childElements(table, 'tr');
    if (rows.length >= 9 && /Dibuat Oleh/i.test(plain) && /Disetujui Oleh/i.test(plain)) {
      return table;
    }
  }

  throw new ApiError('Tabel persetujuan tidak ditemukan di template laporan', 500);
}

let cachedXml: string | null = null;

function loadDocumentXml(): string {
  if (cachedXml) return cachedXml;
  let zip: PizZip;
  try {
    zip = new PizZip(readFileSync(TEMPLATE_PATH));
  } catch {
    throw new ApiError(
      `Template laporan tidak ditemukan di ${TEMPLATE_PATH}. Jalankan scripts/laporan/build-template.mjs.`,
      500
    );
  }
  const xml = zip.file('word/document.xml')?.asText();
  if (!xml) throw new ApiError('Template laporan tidak berisi word/document.xml', 500);
  cachedXml = xml;
  return xml;
}

/** Baca layout tabel persetujuan dari template (opsional isi nama penanda tangan). */
export function readSignatureLayout(values: SignatureLayoutValues = {}): SignatureLayout {
  const table = findApprovalTable(loadDocumentXml());

  const grid = childElements(table, 'tblGrid')[0];
  const gridColumns = grid ? childElements(grid, 'gridCol') : [];
  const widths = gridColumns.map((column) => Number(attr(column, 'w')) || 0);
  const columns: SignatureLayoutColumn[] = widths.map((widthTwip, index) => ({
    index,
    widthTwip,
    widthPx: twipToPx(widthTwip),
  }));

  const rowElements = childElements(table, 'tr');
  const rows: SignatureLayoutRow[] = rowElements.map((row) => {
    const trPr = childElements(row, 'trPr')[0];
    const trHeight = trPr ? childElements(trPr, 'trHeight')[0] : undefined;
    const heightTwip = trHeight ? Number(attr(trHeight, 'val')) || 0 : 0;

    const cells = childElements(row, 'tc').map((cell) => {
      const tcPr = childElements(cell, 'tcPr')[0];
      const gridSpan = tcPr ? childElements(tcPr, 'gridSpan')[0] : undefined;
      const colSpan = gridSpan ? Number(attr(gridSpan, 'val')) || 1 : 1;

      const verticalMerge = tcPr ? childElements(tcPr, 'vMerge')[0] : undefined;
      // `continue` = sel lanjutan dari baris di atas; `restart`/tanpa val = sel baru.
      const isContinuation = Boolean(verticalMerge) && attr(verticalMerge as Element, 'val') === 'continue';

      const bold = allElements(cell, 'b').length > 0;
      const alignNode = allElements(cell, 'jc')[0];
      const align = alignNode ? attr(alignNode, 'val') || null : null;

      return {
        text: isContinuation ? '' : substitute(cellText(cell), values),
        colSpan,
        rowSpan: 1,
        bold,
        align,
      };
    });

    return { heightPx: twipToPx(heightTwip), cells };
  });

  // Hitung rowSpan dari rantai vMerge (continue) per kolom grid.
  const rowElementsMerge = rowElements.map((row) => {
    const cells = childElements(row, 'tc').map((cell) => {
      const tcPr = childElements(cell, 'tcPr')[0];
      const verticalMerge = tcPr ? childElements(tcPr, 'vMerge')[0] : undefined;
      return {
        continuation: verticalMerge !== undefined && attr(verticalMerge, 'val') === 'continue',
      };
    });
    return cells;
  });

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const merges = rowElementsMerge[rowIndex];
    const cells = rows[rowIndex].cells;
    let cellIndex = 0;
    for (let gridIndex = 0; gridIndex < cells.length; gridIndex += 1) {
      // Tidak ada informasi kolom grid per sel di sini; cukup lewati `continue`.
      const merge = merges[cellIndex];
      cellIndex += 1;
      if (!merge || merge.continuation) continue;
      let span = 1;
      let probe = rowIndex + 1;
      while (probe < rows.length) {
        const nextMerges = rowElementsMerge[probe];
        // Jumlah sel per baris bisa berbeda; cocokkan berdasarkan urutan sel.
        const nextCell = nextMerges[cellIndex - 1];
        if (!nextCell || !nextCell.continuation) break;
        span += 1;
        probe += 1;
      }
      cells[gridIndex].rowSpan = span;
    }
  }

  const heightPx = rows.reduce((total, row) => total + row.heightPx, 0);

  return {
    columnCount: widths.length || Math.max(...rows.map((row) => row.cells.length), 0),
    columns,
    rows,
    heightPx,
    source: 'templates/laporan-bulanan.docx',
  };
}

/** Kosongkan cache template (dipakai script verifikasi setelah template dibangun ulang). */
export function clearSignatureLayoutCache(): void {
  cachedXml = null;
}
