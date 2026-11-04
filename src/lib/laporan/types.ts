/**
 * Tipe bersama fitur Laporan Bulanan.
 *
 * Alur: upload .docx buangan (opsional) -> parser menebak modul + caption +
 * gambar -> user melengkapi form -> generator mengisi template resmi
 * `templates/laporan-bulanan.docx` -> arsip ke Google Drive.
 */

export type LaporanSection = 'development' | 'maintenance';

/** Satu baris gambar yang ditemukan parser (dipakai juga sebagai input generate). */
export interface ParsedImage {
  /** Caption tanpa awalan "Figure N-". */
  caption: string;
  /** Nama file asal di dalam docx (diagnostik). */
  imageName: string;
  /** `image/png`, `image/jpeg`, ... */
  mimeType: string;
  /** Data URL (`data:image/png;base64,...`) bila gambarnya tersedia. */
  dataUrl?: string;
}

export interface ParsedModule {
  name: string;
  items: ParsedImage[];
}

export interface LaporanMetaGuess {
  project: string | null;
  docNo: string | null;
  title: string | null;
  /** Label periode seperti tertulis di dokumen, mis. "04 September - 03 Oktober 2026". */
  period: string | null;
  date: string | null;
  version: string | null;
}

export interface ParseStats {
  headings: number;
  modules: number;
  items: number;
  captions: number;
  picturesSkipped: number;
  tables: number;
}

export interface ParseResult {
  fileName: string;
  metaGuess: LaporanMetaGuess;
  modules: ParsedModule[];
  narratives: string[];
  stats: ParseStats;
}

/** Penanda tangan pada lembar persetujuan. */
export interface LaporanSignerData {
  nama?: string;
  jabatan?: string;
  instansi?: string;
  nip?: string;
}

export interface LaporanItemInput {
  modul: string;
  fitur: string;
  status?: string;
  percent?: string | number;
  note?: string;
  /** `development` (tabel Pengembangan) atau `maintenance` (tabel Pemeliharaan). */
  section?: LaporanSection;
  /** Data URL gambar bukti; ikut ke lampiran. */
  gambar?: string;
  /** Caption lampiran; default = `fitur`. */
  caption?: string;
}

export interface LaporanRevisionInput {
  versi: string;
  nama?: string;
  tanggal?: string;
  keterangan?: string;
}

export interface LaporanMetaInput {
  project: string;
  title: string;
  /** Kunci periode `YYYY-MM` (dipakai untuk unique constraint). */
  period: string;
  /** Label tampilan, mis. "04 Oktober - 03 November 2026". Default dari `period`. */
  periodLabel?: string;
  docNo?: string;
  version?: string;
  /** Tanggal dokumen; ISO `YYYY-MM-DD` atau teks bebas. Default hari ini. */
  date?: string;
}

export interface LaporanPayload {
  meta: LaporanMetaInput;
  items: LaporanItemInput[];
  signers?: {
    dibuat?: LaporanSignerData;
    diperiksa?: LaporanSignerData;
    disetujui?: LaporanSignerData;
    /** Slot kedua blok "Disetujui Oleh" (mis. Dept Head). */
    disetujui2?: LaporanSignerData;
  };
  revisions?: LaporanRevisionInput[];
  intro?: string[];
  scope?: string[];
}

/** Bentuk data yang benar-benar dikirim ke docxtemplater. */
export interface LaporanTemplateData {
  project: string;
  title: string;
  period: string;
  docNo: string;
  version: string;
  tanggal: string;
  dibuatNama: string;
  dibuatJabatan: string;
  dibuatInstansi: string;
  diperiksaNama: string;
  diperiksaJabatan: string;
  diperiksaInstansi: string;
  disetujuiNama: string;
  disetujuiJabatan: string;
  disetujuiInstansi: string;
  disetujui2Nama: string;
  disetujui2Jabatan: string;
  disetujui2Instansi: string;
  revisions: { versi: string; nama: string; tanggal: string; keterangan: string }[];
  intro: { text: string }[];
  scope: { text: string }[];
  items: { modul: string; status: string; fitur: string; percent: string }[];
  maintenanceItems: { modul: string; fitur: string; percent: string }[];
  /** Modul lampiran; `gambar` berisi data URL (string) agar modul gambar membacanya. */
  appendix: { modul: string; images: { gambar: string; caption: string }[] }[];
}
