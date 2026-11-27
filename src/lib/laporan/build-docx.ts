import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import ImageModule from 'docxtemplater-image-module-free';
import { ApiError } from '@/lib/api-error';
import { decodeDataUrl, fitImageSize, readImageInfo } from '@/lib/laporan/images';
import { deriveCoverTitle, formatTanggalIndonesia, periodLabelFromKey } from '@/lib/laporan/format';
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

let templateCache: { buffer: Buffer; mtimeMs: number } | null = null;

/**
 * Template di-cache di memori, tapi dibaca ulang bila file berubah (mtime),
 * supaya template hasil `build-template.mjs` langsung dipakai tanpa restart.
 */
function loadTemplate(): Buffer {
  try {
    const { mtimeMs } = statSync(TEMPLATE_PATH);
    if (templateCache && templateCache.mtimeMs === mtimeMs) return templateCache.buffer;
    templateCache = { buffer: readFileSync(TEMPLATE_PATH), mtimeMs };
    return templateCache.buffer;
  } catch {
    throw new ApiError(
      `Template laporan tidak ditemukan di ${TEMPLATE_PATH}. Jalankan scripts/laporan/build-template.mjs.`,
      500
    );
  }
}

/** Teks Pendahuluan bawaan (sama persis dengan dokumen contoh resmi). */
const DEFAULT_INTRO = [
  'Teknologi informasi memiliki peranan yang sangat penting dalam mendukung proses bisnis PT Bukit Asam (Persero) Tbk agar berjalan lebih efektif dan efisien. Pemanfaatan teknologi informasi memberikan berbagai kemudahan, baik dalam berinteraksi dengan pelanggan maupun dengan seluruh relasi terkait. Selain itu, teknologi informasi juga berfungsi sebagai sarana pendukung bagi jajaran manajemen dalam pengambilan keputusan strategis, sehingga mampu memperkuat daya saing perusahaan di tengah dinamika perubahan bisnis yang sangat cepat.',
  'Dalam rangka meningkatkan kualitas layanan sistem teknologi informasi secara berkelanjutan, PT Bukit Asam (Persero) Tbk menyusun Rencana Strategis Teknologi Informasi (RSTI) periode 2018–2022. RSTI ini bertujuan untuk mengarahkan pengembangan dan implementasi aplikasi yang terintegrasi dalam sistem teknologi informasi PT Bukit Asam (Persero) Tbk.',
  'Berdasarkan RSTI tersebut, dilaksanakan proyek Pekerjaan Jasa Konsultan Joint Development SDM. Pada pelaksanaan proyek ini, PT Bukit Asam (Persero) Tbk menunjuk PT Bukit Energi Servis Terpadu sebagai mitra kerja dalam memberikan layanan jasa konsultan Joint Development SDM guna mendukung peningkatan kapabilitas dan pengembangan sumber daya manusia yang selaras dengan kebutuhan transformasi digital perusahaan.',
];

/** Tahapan Ruang Lingkup bawaan (sama dengan dokumen contoh resmi). */
const DEFAULT_SCOPE = ['Analisa', 'Design Interface', 'Development', 'Testing', 'Delivering'];

/**
 * Nomor SPPH untuk cover. Pakai field khusus `meta.spphNo` kalau ada; kalau
 * kosong (mis. laporan lama yang hanya menyimpan "SPPH 6557" di dalam judul),
 * ambil dari pola "SPPH <nomor>" di judul/proyek supaya tetap tampil di cover.
 */
function resolveSpphNo(meta: { spphNo?: string; title?: string; project?: string }): string {
  const explicit = meta.spphNo?.trim();
  if (explicit) return explicit;
  const haystack = `${meta.title ?? ''} ${meta.project ?? ''}`;
  const match = haystack.match(/SPPH\s*[:\-]?\s*\S+/i);
  return match ? match[0].replace(/\s+/g, ' ').trim() : '';
}

/**
 * Pecah judul cover jadi dua baris seperti contoh:
 * "Pekerjaan Jasa Joint Development" / "Digitalisasi Aplikasi Human Capital Operations".
 * Awalan "Laporan" dibuang karena cover sudah memuat "LAPORAN PEKERJAAN".
 */
export function splitCoverTitle(title: string): [string, string] {
  const text = title.replace(/^\s*laporan\s+/i, '').replace(/\s+/g, ' ').trim();
  const marker = text.search(/\sDigitalisasi\s/i);
  if (marker > 0) return [text.slice(0, marker).trim(), text.slice(marker).trim()];

  const words = text.split(' ');
  if (words.length < 2) return [text, ''];
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i += 1) {
    const diff = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
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

  const coverTitle = (meta.coverTitle?.trim() || deriveCoverTitle(meta.title)).trim();
  const [coverLine1, coverLine2] = splitCoverTitle(coverTitle);
  const intro = toTextList(payload.intro);
  const scope = toTextList(payload.scope);

  return {
    project: meta.project.trim(),
    title: meta.title.trim(),
    coverTitle,
    coverLine1,
    coverLine2,
    docTitle: meta.title.trim(),
    statementTitle: deriveCoverTitle(meta.title),
    spphNo: resolveSpphNo(meta),
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
    intro: intro.length > 0 ? intro : toTextList(DEFAULT_INTRO),
    scope: scope.length > 0 ? scope : toTextList(DEFAULT_SCOPE),
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

function xmlEscapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Gabungan isi `<w:t>` satu paragraf. */
function paragraphText(paragraph: string): string {
  return decodeXmlText(
    [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('')
  );
}

/**
 * Isi Daftar Isi & Daftar Gambar dengan entri nyata (seperti contoh), bukan
 * teks "belum diperbarui". Entri tetap dibungkus field TOC sehingga Word
 * menghitung ulang nomor halaman saat dibuka (`updateFields`).
 */
/** Posisi tab kanan Daftar Isi (lebar area konten A4 = 11906 - 2*1440). */
const TOC_RIGHT_TAB = 9026;

function fillTocFields(documentXml: string): string {
  const paragraphs = [...documentXml.matchAll(/<w:p(?=[\s>])[\s\S]*?<\/w:p>/g)].map((m) => m[0]);

  type Entry = { level: 1 | 2; text: string; bookmark: string };
  const headings: Entry[] = [];
  const figures: Entry[] = [];
  let childCounter = 0;
  let bmId = 900;
  const bookmarkByParagraph = new Map<string, string>();

  for (const paragraph of paragraphs) {
    const style = paragraph.match(/<w:pStyle w:val="([^"]+)"/)?.[1];
    if (style !== '912' && style !== '913' && style !== '1079') continue;
    const text = paragraphText(paragraph).replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const bookmark = `_Toc_${bmId++}`;
    bookmarkByParagraph.set(paragraph, bookmark);
    if (style === '1079') {
      figures.push({ level: 1, text, bookmark });
    } else if (style === '912') {
      childCounter = 0;
      headings.push({ level: 1, text, bookmark });
    } else {
      childCounter += 1;
      // Nomor + judul digabung spasi (BUKAN tab) supaya hanya tab leader
      // kanan yang mendorong nomor halaman; indentasi hierarki via pPr.
      headings.push({ level: 2, text: `${childCounter}. ${text}`, bookmark });
    }
  }

  // Tanam bookmark di tiap heading/caption supaya PAGEREF di Daftar Isi punya
  // target. (Satu bookmark per paragraf; id unik.)
  let withBookmarks = documentXml;
  let bmRef = 0;
  for (const [paragraph, name] of bookmarkByParagraph) {
    const id = bmRef++;
    const injected = paragraph.replace(
      /(<w:pPr>[\s\S]*?<\/w:pPr>)?/,
      (pPr) =>
        `${pPr ?? ''}<w:bookmarkStart w:id="${id}" w:name="${name}"/><w:bookmarkEnd w:id="${id}"/>`
    );
    withBookmarks = withBookmarks.replace(paragraph, injected);
  }

  const run = (inner: string) => `<w:r>${inner}</w:r>`;
  // Tab kanan + dot leader, lalu nomor halaman (PAGEREF). Hasil: teks ...... N
  const leaderAndPage = (bookmark: string) =>
    run('<w:tab/>') +
    run('<w:fldChar w:fldCharType="begin"/>') +
    run(`<w:instrText xml:space="preserve"> PAGEREF ${bookmark} \\h </w:instrText>`) +
    run('<w:fldChar w:fldCharType="separate"/>') +
    run('<w:t>1</w:t>') +
    run('<w:fldChar w:fldCharType="end"/>');

  const build = (placeholder: string, instr: string, entries: Entry[], mapStyle: (e: Entry) => string) => {
    if (entries.length === 0) return placeholder;
    const basePPr = placeholder.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? '<w:pPr></w:pPr>';
    const tabs = `<w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${TOC_RIGHT_TAB}"/></w:tabs>`;
    return entries
      .map((entry, index) => {
        let ownPPr = basePPr.replace(/<w:pStyle w:val="[^"]+"\s*\/>/, `<w:pStyle w:val="${mapStyle(entry)}" />`);
        // Pasang tab-stop kanan + dot leader di pPr entri.
        ownPPr = ownPPr.includes('<w:tabs>')
          ? ownPPr
          : ownPPr.replace(/(<w:pPr>)/, `$1${tabs}`);
        const begin =
          index === 0
            ? run('<w:fldChar w:fldCharType="begin"/>') +
              run(`<w:instrText xml:space="preserve"> ${instr} </w:instrText>`) +
              run('<w:fldChar w:fldCharType="separate"/>')
            : '';
        // Judul (tab antar-bagian nomor dipertahankan), lalu leader + nomor.
        const parts = entry.text.split('\t');
        const title = parts
          .map((part, i) => (i > 0 ? run('<w:tab/>') : '') + run(`<w:t xml:space="preserve">${xmlEscapeText(part)}</w:t>`))
          .join('');
        const end = index === entries.length - 1 ? run('<w:fldChar w:fldCharType="end"/>') : '';
        return `<w:p>${ownPPr}${begin}${title}${leaderAndPage(entry.bookmark)}${end}</w:p>`;
      })
      .join('');
  };

  return withBookmarks.replace(
    /<w:p(?=[\s>])(?:(?!<\/w:p>)[\s\S])*?<w:fldSimple w:instr="([^"]*TOC[^"]*)">[\s\S]*?<\/w:p>/g,
    (placeholder, instr: string) => {
      const instruction = decodeXmlText(instr).trim();
      if (/\\c\s+"Figure"/.test(instruction)) {
        return build(placeholder, instr.trim(), figures, () => '1093');
      }
      return build(placeholder, instr.trim(), headings, (e) => (e.level === 1 ? '1091' : '1102'));
    }
  );
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
  documentXml = fillTocFields(documentXml);
  rendered.file('word/document.xml', documentXml);
  fixGeneratedImageExtensions(rendered, documentXml);

  return rendered.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}
