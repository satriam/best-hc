import { readFileSync } from 'node:fs';
import path from 'node:path';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import ImageModule from 'docxtemplater-image-module-free';
import { ApiError } from '@/lib/api-error';
import { decodeDataUrl, fitImageSize, readImageInfo } from '@/lib/laporan/images';
import { formatTanggalIndonesia, periodLabelFromKey } from '@/lib/laporan/format';
import type { LaporanPayload, LaporanTemplateData } from '@/lib/laporan/types';

/**
 * Generator .docx laporan bulanan.
 *
 * Dokumen TIDAK dibangun dari nol: template `templates/laporan-bulanan.docx`
 * adalah file contoh resmi (logo cover, header, footer, style, margin, tabel
 * persetujuan 11 baris) yang hanya diisi tag oleh docxtemplater. Yang berubah
 * saat generate hanyalah teks di dalam `<w:t>` + baris loop, sehingga layout
 * tetap identik dengan contoh.
 */

const TEMPLATE_PATH = path.join(process.cwd(), 'templates', 'laporan-bulanan.docx');

/** Batas ukuran payload (gambar lampiran sudah base64) supaya DB tidak membengkak. */
export const MAX_PAYLOAD_BYTES = 20 * 1024 * 1024;

let templateCache: Buffer | null = null;

function loadTemplate(): Buffer {
  if (templateCache) return templateCache;
  try {
    templateCache = readFileSync(TEMPLATE_PATH);
  } catch {
    throw new ApiError(
      `Template laporan tidak ditemukan di ${TEMPLATE_PATH}. Jalankan scripts/laporan/build-template.mjs.`,
      500
    );
  }
  return templateCache;
}

function toTextList(values: string[] | undefined): { text: string }[] {
  if (!values || values.length === 0) return [];
  return values
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((text) => ({ text }));
}

/** Ubah payload API menjadi data datar yang dipakai tag template. */
export function buildTemplateData(payload: LaporanPayload): LaporanTemplateData {
  const { meta, items, signers } = payload;
  const periodLabel = meta.periodLabel?.trim() || periodLabelFromKey(meta.period);

  const development = items
    .filter((item) => (item.section ?? 'development') === 'development')
    .map((item) => ({
      modul: item.modul.trim(),
      status: (item.status ?? '').trim() || 'Selesai',
      fitur: item.note ? `${item.fitur} — ${item.note}` : item.fitur,
      percent:
        item.percent === undefined || item.percent === null || item.percent === ''
          ? ''
          : `${item.percent}`.includes('%')
            ? `${item.percent}`
            : `${item.percent}%`,
    }));

  const maintenance = items
    .filter((item) => item.section === 'maintenance')
    .map((item) => ({
      modul: item.modul.trim(),
      fitur: item.note ? `${item.fitur} — ${item.note}` : item.fitur,
      percent:
        item.percent === undefined || item.percent === null || item.percent === ''
          ? ''
          : `${item.percent}`.includes('%')
            ? `${item.percent}`
            : `${item.percent}%`,
    }));

  // Lampiran: satu modul = satu heading, gambar dikelompokkan sesuai urutan item.
  const appendix: LaporanTemplateData['appendix'] = [];
  for (const item of items) {
    if (!item.gambar) continue;
    const decoded = decodeDataUrl(item.gambar);
    if (!decoded) continue;
    const moduleName = item.modul.trim() || 'Umum';
    let group = appendix.find((entry) => entry.modul === moduleName);
    if (!group) {
      group = { modul: moduleName, images: [] };
      appendix.push(group);
    }
    group.images.push({
      gambar: item.gambar,
      caption: (item.caption ?? item.fitur).trim(),
    });
  }

  const revisions =
    payload.revisions && payload.revisions.length > 0
      ? payload.revisions.map((revision) => ({
          versi: revision.versi,
          nama: revision.nama ?? signers?.dibuat?.nama ?? '',
          tanggal: formatTanggalIndonesia(revision.tanggal ?? meta.date ?? new Date()),
          keterangan: revision.keterangan ?? '',
        }))
      : [
          {
            versi: meta.version ?? '1.0',
            nama: signers?.dibuat?.nama ?? '',
            tanggal: formatTanggalIndonesia(meta.date ?? new Date()),
            keterangan: 'Dokumen Awal',
          },
        ];

  return {
    project: meta.project.trim(),
    title: meta.title.trim(),
    period: periodLabel,
    docNo: meta.docNo?.trim() ?? '',
    version: meta.version?.trim() || '1.0',
    tanggal: formatTanggalIndonesia(meta.date ?? new Date()),
    dibuatNama: signers?.dibuat?.nama ?? '',
    dibuatJabatan: signers?.dibuat?.jabatan ?? '',
    dibuatInstansi: signers?.dibuat?.instansi ?? '',
    diperiksaNama: signers?.diperiksa?.nama ?? '',
    diperiksaJabatan: signers?.diperiksa?.jabatan ?? '',
    diperiksaInstansi: signers?.diperiksa?.instansi ?? '',
    disetujuiNama: signers?.disetujui?.nama ?? '',
    disetujuiJabatan: signers?.disetujui?.jabatan ?? '',
    disetujuiInstansi: signers?.disetujui?.instansi ?? '',
    disetujui2Nama: signers?.disetujui2?.nama ?? '',
    disetujui2Jabatan: signers?.disetujui2?.jabatan ?? '',
    disetujui2Instansi: signers?.disetujui2?.instansi ?? '',
    revisions,
    intro: toTextList(payload.intro),
    scope: toTextList(payload.scope),
    items: development,
    maintenanceItems: maintenance,
    appendix,
  };
}

/**
 * Nomor caption (`Figure 1- ...`) memakai field SEQ supaya daftar gambar hidup.
 * docxtemplater hanya menyalin XML template, jadi nilai cache field masih "1";
 * di sini nilai cache diurutkan ulang sesuai posisi gambar di lampiran. Word
 * tetap menghitung ulang saat dokumen dibuka (`updateFields`), tapi nilai cache
 * yang benar membuat dokumen sudah tampak benar sebelum F9.
 */
function renumberCaptionFields(documentXml: string): string {
  let counter = 0;
  const paragraphRe = /<w:p(?=[\s>])[\s\S]*?<\/w:p>/g;
  return documentXml.replace(paragraphRe, (paragraph) => {
    if (!/SEQ Figure/.test(paragraph) || !/w:fldCharType="separate"/.test(paragraph)) return paragraph;
    counter += 1;
    const separatorIndex = paragraph.indexOf('w:fldCharType="separate"');
    const head = paragraph.slice(0, separatorIndex);
    const tail = paragraph.slice(separatorIndex);
    const patchedTail = tail.replace(/(<w:t(?:\s[^>]*)?>)(\d+)(<\/w:t>)/, (_match, open, _value, close) => {
      return `${open}${counter}${close}`;
    });
    return head + patchedTail;
  });
}

/** Pastikan `wp:docPr` tiap gambar punya id unik (modul gambar memakai id tetap "2"). */
function renumberDrawingIds(documentXml: string): string {
  let counter = 0;
  return documentXml.replace(/<wp:docPr id="\d+"([^>]*)\/>/g, (_match, rest: string) => {
    counter += 1;
    return `<wp:docPr id="${counter}"${rest}/>`;
  });
}

/**
 * Rename media hasil modul gambar agar ekstensinya cocok dengan isi file.
 * Modul gambar selalu menamai file `image_generated_N.png`; kalau gambarnya
 * JPEG, Word/LibreOffice bisa menolak karena Content-Type-nya salah.
 */
function fixGeneratedImageExtensions(zip: PizZip, documentXml: string): void {
  const relsPath = 'word/_rels/document.xml.rels';
  const relsFile = zip.file(relsPath);
  if (!relsFile) return;
  let rels = relsFile.asText();

  rels = rels.replace(
    /(<Relationship\b[^>]*Target=")(media\/image_generated_(\d+)\.png)("[^>]*\/>)/g,
    (match, prefix: string, target: string, number: string, suffix: string) => {
      const file = zip.file(`word/${target}`);
      if (!file) return match;
      const buffer = file.asNodeBuffer();
      const isJpeg = buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8;
      if (!isJpeg) return match;
      const renamed = `media/image_generated_${number}.jpeg`;
      zip.file(`word/${renamed}`, buffer);
      zip.remove(`word/${target}`);
      return `${prefix}${renamed}${suffix}`;
    }
  );

  zip.file(relsPath, rels);

  const contentTypesFile = zip.file('[Content_Types].xml');
  if (contentTypesFile) {
    let contentTypes = contentTypesFile.asText();
    if (!/Extension="jpeg"/.test(contentTypes)) {
      contentTypes = contentTypes.replace(
        '</Types>',
        '<Default Extension="jpeg" ContentType="image/jpeg"/></Types>'
      );
      zip.file('[Content_Types].xml', contentTypes);
    }
  }
  void documentXml;
}

/**
 * Render laporan menjadi buffer .docx.
 *
 * @throws ApiError 400 bila payload tidak punya modul/item dan template rusak.
 */
export function renderLaporanDocx(payload: LaporanPayload): Buffer {
  const data = buildTemplateData(payload);

  if (data.items.length === 0 && data.maintenanceItems.length === 0) {
    throw new ApiError('Tidak ada item pekerjaan yang bisa dilaporkan', 400);
  }

  const zip = new PizZip(loadTemplate());

  const imageModule = new ImageModule({
    centered: false,
    getImage: (value: string) => {
      const decoded = decodeDataUrl(value);
      if (!decoded) throw new ApiError('Data gambar lampiran tidak valid (harus data URL base64)', 400);
      return decoded.buffer;
    },
    getSize: (buffer: Buffer) => fitImageSize(readImageInfo(buffer)),
  });

  let rendered: PizZip;
  try {
    const doc = new Docxtemplater(zip, {
      modules: [imageModule],
      paragraphLoop: true,
      linebreaks: false,
      nullGetter: () => '',
    });
    doc.render(data);
    rendered = doc.getZip();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'kesalahan tidak dikenal';
    throw new ApiError(`Gagal menyusun dokumen laporan: ${message}`, 500);
  }

  let documentXml = rendered.file('word/document.xml')?.asText();
  if (!documentXml) throw new ApiError('Dokumen hasil tidak berisi word/document.xml', 500);

  documentXml = renumberCaptionFields(documentXml);
  documentXml = renumberDrawingIds(documentXml);
  rendered.file('word/document.xml', documentXml);
  fixGeneratedImageExtensions(rendered, documentXml);

  return rendered.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}
