/**
 * Tipe sisi UI untuk fitur Laporan Bulanan.
 *
 * Bentuknya mengikuti respons API nyata (`src/app/api/laporan/**`), bukan
 * asumsi: `GET /api/laporan` → `data: LaporanListItem[]`,
 * `GET /api/laporan/[id]` → row + `meta` (payload tersimpan),
 * `POST /api/laporan/parse` → `data: ParseResponseData`,
 * `GET /api/laporan/signers` → `data: LaporanSigner[]`.
 */

export type LaporanSection = 'development' | 'maintenance';

export type LaporanStatus = 'draft' | 'selesai';

export type LaporanSignerRoleValue = 'DIBUAT' | 'DIPERIKSA' | 'DISETUJUI';

/** Satu gambar hasil parser (dipakai juga sebagai input generate). */
export interface ParsedImage {
  /** Caption tanpa awalan "Figure N-". */
  caption: string;
  imageName: string;
  mimeType: string;
  /** Data URL `data:image/png;base64,...` bila gambarnya tersedia. */
  dataUrl?: string;
  /** Status/progress item (mis. kolom tabel "Progress"). */
  status?: string;
  /** Persentase progress (mis. kolom tabel "Persen"). */
  percent?: string;
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

export interface ParseDocStats {
  headings: number;
  modules: number;
  items: number;
  captions: number;
  picturesSkipped: number;
  tables: number;
}

export interface ParseDocResult {
  fileName: string;
  metaGuess: LaporanMetaGuess;
  modules: ParsedModule[];
  narratives: string[];
  stats: ParseDocStats;
}

/** Respons `POST /api/laporan/parse`. */
export interface ParseResponseData {
  docs: ParseDocResult[];
  /** Gabungan modul semua file, siap dipakai wizard. */
  modules: ParsedModule[];
  metaGuess: LaporanMetaGuess;
  stats: { files: number; modules: number; items: number };
}

/** Baris daftar laporan (`GET /api/laporan`). */
export interface LaporanListItem {
  id: string;
  /** Kunci periode `YYYY-MM`. */
  period: string;
  projectName: string;
  docNo: string | null;
  title: string;
  version: string;
  status: LaporanStatus | string;
  itemCount: number;
  driveFileId: string | null;
  driveLink: string | null;
  createdById?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LaporanItemPayload {
  modul: string;
  fitur: string;
  status?: string;
  percent?: string | number;
  note?: string;
  section?: LaporanSection;
  gambar?: string;
  caption?: string;
}

export interface LaporanSignerPayload {
  id?: string;
  nama?: string;
  jabatan?: string;
  instansi?: string;
  nip?: string;
}

/** Payload lengkap yang disimpan backend di kolom `meta`. */
export interface LaporanSavedPayload {
  meta: {
    project: string;
    title: string;
    period: string;
    periodLabel?: string;
    docNo?: string;
    version?: string;
    date?: string;
  };
  items: LaporanItemPayload[];
  signers?: {
    dibuat?: LaporanSignerPayload;
    diperiksa?: LaporanSignerPayload;
    disetujui?: LaporanSignerPayload;
    disetujui2?: LaporanSignerPayload;
  };
  revisions?: Array<{ versi: string; nama?: string; tanggal?: string; keterangan?: string }>;
  intro?: string[];
  scope?: string[];
}

/** Respons `GET /api/laporan/[id]`. */
export interface LaporanDetail extends LaporanListItem {
  meta: LaporanSavedPayload | null;
}

/** Body `POST /api/laporan/generate` (sesuai `laporanGenerateSchema`). */
export interface LaporanGenerateRequest {
  meta: {
    /** Alias kontrak API untuk `projectName`. */
    project: string;
    title: string;
    /** Kunci periode `YYYY-MM` (dari tanggal akhir rentang). */
    period: string;
    periodLabel?: string;
    /** Alias kontrak API untuk `spphNo`. */
    docNo?: string;
    version?: string;
    date?: string;
    // Nama field sesuai form/cover final (dikirim juga agar payload jelas).
    projectName?: string;
    spphNo?: string;
    periodStart?: string;
    periodEnd?: string;
  };
  // Cermin field form di level atas.
  projectName?: string;
  docNo?: string;
  spphNo?: string;
  periodStart?: string;
  periodEnd?: string;
  periodLabel?: string;
  version?: string;
  items: LaporanItemPayload[];
  signers?: {
    dibuat?: LaporanSignerPayload;
    diperiksa?: LaporanSignerPayload;
    disetujui?: LaporanSignerPayload;
    disetujui2?: LaporanSignerPayload;
  };
}

/** Master penanda tangan laporan (`GET /api/laporan/signers`). */
export interface LaporanSigner {
  id: string;
  role: LaporanSignerRoleValue;
  name: string;
  nip: string | null;
  /** Jabatan. */
  position: string | null;
  /** Instansi/unit. */
  department: string | null;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Bentuk aksi dari `POST /api/laporan/signers`. */
export interface LaporanSignerInput {
  role: LaporanSignerRoleValue;
  name: string;
  nip?: string | null;
  position?: string | null;
  department?: string | null;
  isActive?: boolean;
  isDefault?: boolean;
  sortOrder?: number;
}
