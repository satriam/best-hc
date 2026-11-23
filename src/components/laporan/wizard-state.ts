/**
 * State wizard Laporan Bulanan + persistensinya di sessionStorage.
 *
 * Kategori (`section`) melekat pada ITEM, bukan modul: satu modul boleh punya
 * item di panel "Pengembangan Aplikasi" dan "Pemeliharaan Aplikasi" sekaligus
 * (item bisa dipindah antar panel pada langkah Review Item).
 *
 * Gambar lampiran dikirim parser sebagai data URL base64 sehingga total bisa
 * beberapa MB. Persistensi mencoba menyimpan utuh dulu; bila kuota
 * sessionStorage terlampaui, hanya salinan tersimpan yang kehilangan gambar —
 * state di memori tetap membawa gambar untuk generate.
 */

import type { LaporanGenerateRequest, LaporanSection, LaporanSignerRoleValue, ParsedModule } from './types';
import { buildPeriodLabel, periodKeyFromEnd, todayIso } from './laporan-ui';

export const WIZARD_STORAGE_KEY = 'besthcm:laporan-wizard:v1';

/**
 * Kunci sessionStorage per laporan. Mode buat-baru memakai kunci dasar; mode
 * edit memakai `…:edit:<id>` supaya membuka dua laporan berbeda tidak saling
 * menimpa draft (dan refresh halaman edit tidak mereset form).
 */
export function wizardStorageKey(laporanId?: string | null): string {
  return laporanId ? `${WIZARD_STORAGE_KEY}:edit:${laporanId}` : WIZARD_STORAGE_KEY;
}

/** Pilihan status pekerjaan yang dipakai template laporan. */
export const ITEM_STATUS_OPTIONS = ['Selesai', 'Dalam Proses', 'Belum Selesai', 'Ditunda'];

/** Judul panel — sama dengan section pada template dokumen. */
export const SECTION_TITLE: Record<LaporanSection, string> = {
  development: 'Pengembangan Aplikasi',
  maintenance: 'Pemeliharaan Aplikasi',
};

/** Sebutan pendek untuk toast & label ringkas. */
export const SECTION_SHORT: Record<LaporanSection, string> = {
  development: 'Pengembangan',
  maintenance: 'Pemeliharaan',
};

export interface ItemDraft {
  key: string;
  fitur: string;
  status: string;
  /** Disimpan sebagai string agar input angka bisa kosong. */
  percent: string;
  note: string;
  /** Panel tempat item berada (dikirim sebagai `items[].section`). */
  section: LaporanSection;
  /** Data URL gambar bukti (opsional). */
  gambar: string | null;
  imageName: string | null;
  caption: string;
}

export interface ModuleDraft {
  key: string;
  name: string;
  items: ItemDraft[];
}

export interface MetaDraft {
  /** Nama proyek pada cover & lembar persetujuan. */
  project: string;
  /** Judul cover (pendek), mis. `Digitalisasi Aplikasi Human Capital Operations`. */
  coverTitle: string;
  /** Judul dokumen (panjang) pada lembar persetujuan. */
  title: string;
  /** No Dokumen resmi, mis. `2496/Eks-BEST/BA/PBOE-272/X/2026`. */
  docNo: string;
  /** Nomor SPPH, mis. `SPPH 6557` (field terpisah dari No Dokumen). */
  spphNo: string;
  /** Tanggal mulai periode kerja (ISO `YYYY-MM-DD`). */
  periodStart: string;
  /** Tanggal akhir periode kerja (ISO `YYYY-MM-DD`). */
  periodEnd: string;
  /** Label periode pada cover; otomatis dari rentang, bisa diedit manual. */
  periodLabel: string;
  /** true = label sudah diedit manual sehingga tidak ditimpa rentang tanggal. */
  periodLabelManual: boolean;
  version: string;
  /** Tanggal dokumen (ISO `YYYY-MM-DD`). */
  date: string;
}

/** Isian default cover final (dipakai bila dokumen sumber tidak memberi petunjuk). */
export const DEFAULT_PROJECT = 'Pekerjaan Jasa Joint Development';
export const DEFAULT_COVER_TITLE = 'Digitalisasi Aplikasi Human Capital Operations';
export const DEFAULT_TITLE =
  'Laporan Pekerjaan Jasa Joint Developtment Digitalisasi Aplikasi Human Capital Operations';

export interface SignerSelection {
  dibuat: string;
  diperiksa: string;
  disetujui: string;
  disetujui2: string;
}

export interface GeneratedInfo {
  id: string;
  fileName: string;
  generatedAt: string;
}

export interface DriveInfo {
  link: string;
  fileName: string;
  archivedAt: string;
}

export interface WizardState {
  /** 1 = Upload, 2 = Review item, 3 = Penanda tangan, 4 = Generate. */
  step: number;
  meta: MetaDraft;
  modules: ModuleDraft[];
  signers: SignerSelection;
  /** Daftar file yang dipilih (untuk ditampilkan ulang setelah reload). */
  files: Array<{ name: string; size: number }>;
  parseSummary: { files: number; modules: number; items: number } | null;
  generated: GeneratedInfo | null;
  drive: DriveInfo | null;
  /** true = gambar tidak ikut tersimpan di sessionStorage karena kuota. */
  imagesDropped: boolean;
}

let keyCounter = 0;

/** Kunci unik stabil untuk baris/modul (tidak dipakai di payload API). */
export function nextDraftKey(prefix: string): string {
  keyCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${keyCounter}`;
}

/**
 * Bersihkan judul item dari penanda kategori seperti `[Reward & Punishment]`
 * serta pemisah sisa (`–`, `-`, `:`). Modul ditampilkan terpisah, jadi judul
 * item harus bersih baik saat dirender maupun saat dikirim ke generator.
 */
export function sanitizeItemTitle(value: string): string {
  if (!value) return '';
  return value
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\s*[–—\-:|•]+\s*/, '')
    .trim();
}

export function createEmptyItem(section: LaporanSection = 'development'): ItemDraft {
  return {
    key: nextDraftKey('item'),
    fitur: '',
    status: 'Selesai',
    percent: '',
    note: '',
    section,
    gambar: null,
    imageName: null,
    caption: '',
  };
}

export function createEmptyModule(name = '', section: LaporanSection = 'development'): ModuleDraft {
  return {
    key: nextDraftKey('modul'),
    name,
    items: [createEmptyItem(section)],
  };
}

export function createEmptyWizardState(): WizardState {
  return {
    step: 1,
    meta: {
      project: DEFAULT_PROJECT,
      coverTitle: DEFAULT_COVER_TITLE,
      title: DEFAULT_TITLE,
      docNo: '',
      spphNo: '',
      periodStart: '',
      periodEnd: '',
      periodLabel: '',
      periodLabelManual: false,
      version: '1.0',
      date: todayIso(),
    },
    modules: [],
    signers: { dibuat: '', diperiksa: '', disetujui: '', disetujui2: '' },
    files: [],
    parseSummary: null,
    generated: null,
    drive: null,
    imagesDropped: false,
  };
}

/** Ubah hasil parser menjadi modul draft (satu item = satu gambar). */
export function modulesFromParsed(modules: ParsedModule[]): ModuleDraft[] {
  return modules.map((modul) => ({
    key: nextDraftKey('modul'),
    name: modul.name,
    items:
      modul.items.length > 0
        ? modul.items.map((image) => {
            // Judul disimpan sudah bersih: penanda kategori `[...]` tidak ikut
            // ke draft maupun ke dokumen hasil generate.
            const clean = sanitizeItemTitle(image.caption);
            // Status/persen dari tabel (mis. kolom "Progress") dipakai apa adanya;
            // fallback "Selesai" kalau item gambar tanpa status.
            const rawPercent = (image.percent ?? '').toString().trim();
            return {
              key: nextDraftKey('item'),
              fitur: clean,
              status: (image.status ?? '').trim() || 'Selesai',
              percent: rawPercent,
              note: '',
              section: 'development' as LaporanSection,
              gambar: image.dataUrl ?? null,
              imageName: image.imageName,
              caption: clean,
            };
          })
        : [createEmptyItem()],
  }));
}

/** Jumlah item yang benar-benar diisi (dipakai counter & validasi). */
export function countFilledItems(modules: ModuleDraft[]): number {
  return modules.reduce(
    (total, modul) => total + modul.items.filter((item) => item.fitur.trim().length > 0).length,
    0
  );
}

/** Rata-rata persentase item yang punya angka (0 bila belum ada). */
export function averagePercent(modules: ModuleDraft[]): number {
  const values: number[] = [];
  modules.forEach((modul) => {
    modul.items.forEach((item) => {
      if (item.fitur.trim().length === 0) return;
      const value = Number(item.percent);
      if (item.percent.trim() !== '' && Number.isFinite(value)) values.push(value);
    });
  });
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/** Statistik per panel: jumlah item + rata-rata % masing-masing section. */
export function sectionStats(modules: ModuleDraft[]): {
  development: { count: number; avgPercent: number };
  maintenance: { count: number; avgPercent: number };
  moduleCount: number;
} {
  const build = (section: LaporanSection) => {
    const items = modules.flatMap((modul) =>
      modul.items.filter((item) => item.section === section && item.fitur.trim().length > 0)
    );
    const numbers = items
      .map((item) => (item.percent.trim() === '' ? NaN : Number(item.percent)))
      .filter((value) => Number.isFinite(value));
    return {
      count: items.length,
      avgPercent:
        numbers.length === 0
          ? 0
          : Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length),
    };
  };

  return {
    development: build('development'),
    maintenance: build('maintenance'),
    moduleCount: modules.filter((modul) => modul.items.some((item) => item.fitur.trim().length > 0))
      .length,
  };
}

/** Validasi langkah 1 (identitas laporan sesuai cover final). */
export function validateMeta(meta: MetaDraft): Partial<Record<keyof MetaDraft, string>> {
  const errors: Partial<Record<keyof MetaDraft, string>> = {};
  if ((meta.project ?? '').trim().length < 3) {
    errors.project = 'Nama proyek wajib diisi (minimal 3 karakter).';
  }
  if ((meta.title ?? '').trim().length < 3) {
    errors.title = 'Judul dokumen wajib diisi (minimal 3 karakter).';
  }
  if ((meta.coverTitle ?? '').trim().length < 3) {
    errors.coverTitle = 'Judul cover wajib diisi (minimal 3 karakter).';
  }
  if (!meta.periodStart) {
    errors.periodStart = 'Periode mulai wajib diisi.';
  }
  if (!meta.periodEnd) {
    errors.periodEnd = 'Periode selesai wajib diisi.';
  }
  if (meta.periodStart && meta.periodEnd && meta.periodEnd < meta.periodStart) {
    errors.periodEnd = 'Periode selesai tidak boleh sebelum periode mulai.';
  }
  if (meta.periodStart && meta.periodEnd && !periodKeyFromEnd(meta.periodEnd)) {
    errors.periodEnd = 'Periode selesai harus berupa tanggal yang valid.';
  }
  if (meta.date && !/^\d{4}-\d{2}-\d{2}$/.test((meta.date ?? '').trim())) {
    errors.date = 'Tanggal dokumen tidak valid.';
  }
  return errors;
}

/** Validasi langkah 2 (item pekerjaan). */
export function validateItems(modules: ModuleDraft[]): string | null {
  if (modules.length === 0) return 'Tambahkan minimal satu modul pekerjaan.';
  if (countFilledItems(modules) === 0) return 'Isi minimal satu baris fitur pekerjaan.';

  const moduleWithoutName = modules.find(
    (modul) => modul.items.some((item) => item.fitur.trim()) && modul.name.trim().length === 0
  );
  if (moduleWithoutName) return 'Setiap modul yang punya item harus diberi nama modul.';

  const invalidPercent = modules.some((modul) =>
    modul.items.some((item) => {
      if (item.fitur.trim().length === 0 || item.percent.trim() === '') return false;
      const value = Number(item.percent);
      return !Number.isFinite(value) || value < 0 || value > 100;
    })
  );
  if (invalidPercent) return 'Persentase harus berupa angka 0–100.';

  return null;
}

/**
 * Normalisasi state tersimpan. Draft versi lama menaruh `section` di modul
 * (bukan per item) — tanpa ini, item lama kehilangan kategorinya.
 */
function normalizeStoredState(raw: unknown): WizardState | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<WizardState> & {
    modules?: Array<ModuleDraft & { section?: LaporanSection }>;
  };
  if (!candidate.meta) return null;

  const modules: ModuleDraft[] = (candidate.modules ?? []).map((modul) => ({
    key: modul.key ?? nextDraftKey('modul'),
    name: modul.name ?? '',
    items: (modul.items ?? []).map((item) => ({
      key: item.key ?? nextDraftKey('item'),
      fitur: item.fitur ?? '',
      status: item.status ?? 'Selesai',
      percent: item.percent ?? '',
      note: item.note ?? '',
      section:
        item.section ??
        (modul as ModuleDraft & { section?: LaporanSection }).section ??
        'development',
      gambar: item.gambar ?? null,
      imageName: item.imageName ?? null,
      caption: item.caption ?? '',
    })),
  }));

  return { ...(candidate as WizardState), modules, meta: normalizeStoredMeta(candidate.meta) };
}

/** Migrasi meta versi lama (`period`/`docNo`) ke model cover final. */
function normalizeStoredMeta(
  raw: MetaDraft & { period?: string; docNo?: string; spphNo?: string }
): MetaDraft {
  const base = createEmptyWizardState().meta;
  const periodLabel = (raw.periodLabel ?? '').trim();
  const derived = buildPeriodLabel(raw.periodStart ?? '', raw.periodEnd ?? '');

  // Draft lama hanya menyimpan kunci `YYYY-MM` — pakai tanggal 1 s.d. akhir bulan.
  let periodStart = raw.periodStart ?? '';
  let periodEnd = raw.periodEnd ?? '';
  if (!periodStart && raw.period) {
    periodStart = `${raw.period}-01`;
    const [year, month] = raw.period.split('-').map(Number);
    if (Number.isFinite(year) && Number.isFinite(month)) {
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      periodEnd = `${raw.period}-${String(lastDay).padStart(2, '0')}`;
    }
  }

  return {
    project: raw.project?.trim() || base.project,
    coverTitle: raw.coverTitle?.trim() || base.coverTitle,
    title: raw.title?.trim() || base.title,
    docNo: raw.docNo ?? '',
    spphNo: raw.spphNo ?? '',
    periodStart,
    periodEnd,
    periodLabel: periodLabel || derived,
    periodLabelManual: raw.periodLabelManual ?? false,
    version: raw.version?.trim() || base.version,
    date: raw.date || base.date,
  };
}

/** Ambil state dari sessionStorage (aman untuk SSR: cek `window`). */
export function loadWizardState(laporanId?: string | null): WizardState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(wizardStorageKey(laporanId));
    if (!raw) return null;
    return normalizeStoredState(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Simpan state; bila kuota penuh, simpan versi tanpa gambar.
 *
 * Penting: state di memori TIDAK diubah — gambar tetap dipakai untuk generate
 * pada sesi ini. Hanya salinan di sessionStorage yang kehilangan gambar.
 */
export function persistWizardState(
  state: WizardState,
  laporanId?: string | null
): {
  stored: boolean;
  imagesDropped: boolean;
} {
  if (typeof window === 'undefined') return { stored: false, imagesDropped: false };
  const key = wizardStorageKey(laporanId);

  try {
    window.sessionStorage.setItem(key, JSON.stringify(state));
    return { stored: true, imagesDropped: false };
  } catch {
    const stripped: WizardState = {
      ...state,
      imagesDropped: true,
      modules: state.modules.map((modul) => ({
        ...modul,
        items: modul.items.map((item) => ({ ...item, gambar: null })),
      })),
    };
    try {
      window.sessionStorage.setItem(key, JSON.stringify(stripped));
      return { stored: true, imagesDropped: true };
    } catch {
      return { stored: false, imagesDropped: true };
    }
  }
}

export function clearWizardStorage(laporanId?: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(wizardStorageKey(laporanId));
  } catch {
    // abaikan: storage bisa diblokir mode privat
  }
}

/** Sinkronkan pilihan penanda tangan dengan master yang baru dimuat. */
export function applyDefaultSignerSelection(
  selection: SignerSelection,
  signers: Array<{ id: string; role: LaporanSignerRoleValue; isDefault: boolean; sortOrder: number }>
): SignerSelection {
  const pick = (role: LaporanSignerRoleValue): string => {
    const list = signers.filter((signer) => signer.role === role).sort((a, b) => a.sortOrder - b.sortOrder);
    const preferred = list.find((signer) => signer.isDefault) ?? list[0];
    return preferred?.id ?? '';
  };

  const next: SignerSelection = { ...selection };
  if (!next.dibuat) next.dibuat = pick('DIBUAT');
  if (!next.diperiksa) next.diperiksa = pick('DIPERIKSA');
  if (!next.disetujui) next.disetujui = pick('DISETUJUI');
  if (!next.disetujui2) {
    const second = signers
      .filter((signer) => signer.role === 'DISETUJUI')
      .sort((a, b) => a.sortOrder - b.sortOrder)[1];
    next.disetujui2 = second?.id ?? '';
  }
  return next;
}

/** Label periode efektif: manual bila sudah diedit, selain itu dari rentang tanggal. */
export function effectivePeriodLabel(meta: MetaDraft): string {
  const manual = (meta.periodLabel ?? '').trim();
  if (meta.periodLabelManual && manual) return manual;
  return buildPeriodLabel(meta.periodStart, meta.periodEnd) || manual;
}

/** Teks ringkas periode untuk ringkasan generate. */
export function periodDisplay(meta: MetaDraft): string {
  return effectivePeriodLabel(meta) || '—';
}

/**
 * Susun body `POST /api/laporan/generate` dari state wizard.
 *
 * Dua hal penting:
 * 1. Kontrak API (`laporanGenerateSchema`) memakai `meta.project` / `meta.docNo`
 *    / `meta.period` (kunci `YYYY-MM`). Field form (projectName, spphNo,
 *    periodStart, periodEnd) dipetakan ke sana supaya backend tidak berubah.
 * 2. Field bernama form tetap dikirim apa adanya di level atas & di dalam meta
 *    agar payload terbaca jelas oleh konsumen lain; key tambahan diabaikan
 *    oleh skema zod backend.
 */
export function buildGenerateRequest(state: WizardState): LaporanGenerateRequest {
  const items = state.modules.flatMap((modul) => {
    const moduleName = modul.name.trim() || 'Umum';
    return modul.items
      .filter((item) => item.fitur.trim().length > 0)
      .map((item) => {
        const percentValue = item.percent.trim() === '' ? undefined : Number(item.percent);
        const cleanTitle = sanitizeItemTitle(item.fitur) || item.fitur.trim();
        return {
          modul: moduleName,
          fitur: cleanTitle,
          status: item.status.trim() || undefined,
          percent: percentValue !== undefined && Number.isFinite(percentValue) ? percentValue : undefined,
          note: item.note.trim() || undefined,
          section: item.section,
          gambar: item.gambar ?? undefined,
          caption: sanitizeItemTitle(item.caption) || cleanTitle,
        };
      });
  });

  const signers: LaporanGenerateRequest['signers'] = {};
  if (state.signers.dibuat) signers.dibuat = { id: state.signers.dibuat };
  if (state.signers.diperiksa) signers.diperiksa = { id: state.signers.diperiksa };
  if (state.signers.disetujui) signers.disetujui = { id: state.signers.disetujui };
  if (state.signers.disetujui2) signers.disetujui2 = { id: state.signers.disetujui2 };

  const projectName = (state.meta.project ?? '').trim();
  const title = (state.meta.title ?? '').trim();
  const docNo = (state.meta.docNo ?? '').trim();
  const spphNo = (state.meta.spphNo ?? '').trim();
  const periodStart = (state.meta.periodStart ?? '').trim();
  const periodEnd = (state.meta.periodEnd ?? '').trim();
  const periodLabel = effectivePeriodLabel(state.meta);
  const periodKey = periodKeyFromEnd(periodEnd);
  const version = (state.meta.version ?? '').trim() || '1.0';
  const date = (state.meta.date ?? '').trim() || undefined;

  return {
    meta: {
      // Field kontrak API
      project: projectName,
      title,
      period: periodKey,
      periodLabel: periodLabel || undefined,
      docNo: docNo || undefined,
      version,
      date,
      // Field form (nama sesuai cover final)
      projectName,
      spphNo: spphNo || undefined,
      periodStart,
      periodEnd,
    },
    // Cermin di level atas supaya payload self-describing.
    projectName,
    docNo: docNo || undefined,
    spphNo: spphNo || undefined,
    periodStart,
    periodEnd,
    periodLabel: periodLabel || undefined,
    version,
    items,
    signers: Object.keys(signers).length > 0 ? signers : undefined,
  };
}

/** Isi meta dari hasil parser; field yang kosong memakai default cover final. */
export function metaFromGuess(guess: {
  project?: string | null;
  title?: string | null;
  docNo?: string | null;
  period?: string | null;
  date?: string | null;
  version?: string | null;
}): Partial<MetaDraft> {
  const { periodStart, periodEnd } = parsePeriodText(guess.period);
  const title = guess.title?.trim() || '';
  // PENTING: patch ini di-spread ke `meta` (`{ ...meta, ...patch }`). Nilai
  // `undefined` akan MENIMPA string jadi undefined -> input controlled berubah
  // jadi uncontrolled (warning React). Jadi sertakan HANYA key yang ada isinya.
  const patch: Partial<MetaDraft> = { periodLabelManual: false };
  const set = <K extends keyof MetaDraft>(key: K, value: MetaDraft[K] | '' | undefined) => {
    if (value !== undefined && value !== '') patch[key] = value as MetaDraft[K];
  };
  set('project', guess.project?.trim());
  // Cover memakai judul pendek; lembar persetujuan memakai judul panjang.
  set('coverTitle', title);
  set('title', title);
  // No Dokumen pada cover Word terisi otomatis; Nomor SPPH tetap manual.
  set('docNo', guess.docNo?.trim());
  set('periodStart', periodStart);
  set('periodEnd', periodEnd);
  set('periodLabel', guess.period?.trim());
  set('version', guess.version?.trim());
  return patch;
}

/**
 * Tebak dua tanggal dari label periode hasil parser, mis.
 * "04 September - 03 Oktober 2026" → { 2026-09-04, 2026-10-03 }.
 */
export function parsePeriodText(text?: string | null): { periodStart: string; periodEnd: string } {
  if (!text) return { periodStart: '', periodEnd: '' };

  const yearMatch = text.match(/(19|20)\d{2}/g);
  const fallbackYear = yearMatch ? yearMatch[yearMatch.length - 1] : '';

  const parts = text.split(/\s*[-–—]\s*/);
  const read = (chunk: string, inheritedYear: string): string => {
    const lower = chunk.toLowerCase();
    const dayMatch = lower.match(/\b(\d{1,2})\b/);
    let monthIndex = -1;
    MONTH_NAMES_LOWER.forEach((name, index) => {
      if (lower.includes(name)) monthIndex = index;
    });
    const yearInChunk = chunk.match(/(19|20)\d{2}/);
    const year = yearInChunk ? yearInChunk[0] : inheritedYear;
    if (monthIndex < 0 || !dayMatch || !year) return '';
    return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${dayMatch[1].padStart(2, '0')}`;
  };

  if (parts.length >= 2) {
    const start = read(parts[0], fallbackYear);
    const end = read(parts.slice(1).join(' '), fallbackYear);
    return { periodStart: start, periodEnd: end };
  }

  const single = read(text, fallbackYear);
  return { periodStart: single, periodEnd: single };
}

const MONTH_NAMES_LOWER = [
  'januari',
  'februari',
  'maret',
  'april',
  'mei',
  'juni',
  'juli',
  'agustus',
  'september',
  'oktober',
  'november',
  'desember',
];

/**
 * Susun state wizard dari laporan tersimpan (`GET /api/laporan/[id]`) supaya
 * halaman edit terisi penuh: meta, item (kategori + urutan), gambar, penanda
 * tangan.
 *
 * Catatan data: payload tersimpan menyimpan penanda tangan sebagai nama/nip
 * (bukan id), jadi id dicocokkan kembali ke master lewat nama. Bila nama tidak
 * ada di master, pilihan dibiarkan kosong dan backend memakai default master.
 */
export function wizardStateFromDetail(
  detail: {
    id: string;
    period: string;
    projectName: string;
    docNo: string | null;
    title: string;
    version: string;
    status: string;
    driveLink: string | null;
    updatedAt: string;
    meta: {
      meta?: {
        project?: string;
        title?: string;
        periodLabel?: string;
        docNo?: string;
        version?: string;
        date?: string;
        projectName?: string;
        spphNo?: string;
        periodStart?: string;
        periodEnd?: string;
      };
      items?: Array<{
        modul?: string;
        fitur?: string;
        status?: string;
        percent?: string | number;
        note?: string;
        section?: LaporanSection;
        gambar?: string;
        caption?: string;
      }>;
      signers?: Record<string, { nama?: string; nip?: string } | undefined>;
    } | null;
  },
  signers: Array<{ id: string; role: LaporanSignerRoleValue; name: string }>
): WizardState {
  const base = createEmptyWizardState();
  const saved = detail.meta;
  const savedMeta = saved?.meta ?? {};

  const title = (savedMeta.title || detail.title || base.meta.title).trim();
  const periodLabel = (savedMeta.periodLabel || '').trim();
  const parsedPeriod = parsePeriodText(periodLabel);
  const fallbackStart = detail.period ? `${detail.period}-01` : '';
  const fallbackEnd = detail.period ? endOfPeriodMonth(detail.period) : '';

  // SPPH hanya ada di teks judul (template tidak punya field khusus).
  const spphFromTitle = title.match(/SPPH\s*\d+/i)?.[0] ?? '';

  const modules: ModuleDraft[] = [];
  (saved?.items ?? []).forEach((item) => {
    const moduleName = (item.modul ?? '').trim() || 'Umum';
    let modul = modules.find((entry) => entry.name === moduleName);
    if (!modul) {
      modul = { key: nextDraftKey('modul'), name: moduleName, items: [] };
      modules.push(modul);
    }
    const rawFitur = item.fitur ?? '';
    const cleanFitur = sanitizeItemTitle(rawFitur) || rawFitur;
    modul.items.push({
      key: nextDraftKey('item'),
      fitur: cleanFitur,
      status: item.status?.trim() || 'Selesai',
      percent:
        item.percent === undefined || item.percent === null || item.percent === ''
          ? ''
          : String(item.percent),
      note: item.note ?? '',
      section: item.section === 'maintenance' ? 'maintenance' : 'development',
      gambar: item.gambar ?? null,
      imageName: null,
      caption: sanitizeItemTitle(item.caption ?? '') || cleanFitur,
    });
  });

  const matchSigner = (role: LaporanSignerRoleValue, name?: string): string => {
    const target = (name ?? '').trim().toLowerCase();
    if (!target) return '';
    const found = signers.find(
      (signer) => signer.role === role && signer.name.trim().toLowerCase() === target
    );
    return found?.id ?? '';
  };

  return {
    ...base,
    step: 2,
    meta: {
      project: (savedMeta.project || savedMeta.projectName || detail.projectName || '').trim(),
      coverTitle: coverTitleFromTitle(title) || base.meta.coverTitle,
      title: title || base.meta.title,
      docNo: (savedMeta.docNo || detail.docNo || '').trim(),
      spphNo: (savedMeta.spphNo || spphFromTitle).trim(),
      periodStart: (savedMeta.periodStart || parsedPeriod.periodStart || fallbackStart).trim(),
      periodEnd: (savedMeta.periodEnd || parsedPeriod.periodEnd || fallbackEnd).trim(),
      periodLabel: periodLabel || buildPeriodLabel(fallbackStart, fallbackEnd),
      periodLabelManual: Boolean(periodLabel),
      version: (savedMeta.version || detail.version || '1.0').trim(),
      date: (savedMeta.date || detail.updatedAt.slice(0, 10) || base.meta.date).trim(),
    },
    modules,
    signers: {
      dibuat: matchSigner('DIBUAT', saved?.signers?.dibuat?.nama),
      diperiksa: matchSigner('DIPERIKSA', saved?.signers?.diperiksa?.nama),
      disetujui: matchSigner('DISETUJUI', saved?.signers?.disetujui?.nama),
      disetujui2: matchSigner('DISETUJUI', saved?.signers?.disetujui2?.nama),
    },
    generated: { id: detail.id, fileName: '', generatedAt: detail.updatedAt },
    drive: detail.driveLink
      ? { link: detail.driveLink, fileName: '', archivedAt: detail.updatedAt }
      : null,
  };
}

/** Judul cover = judul dokumen tanpa embel-embel periode & SPPH. */
export function coverTitleFromTitle(title: string): string {
  return title
    .replace(/\s*periode\s+\d{1,2}\s+[A-Za-z]+\s*[-–—]\s*\d{1,2}\s+[A-Za-z]+\s+\d{4}\s*/gi, ' ')
    .replace(/\s*SPPH\s*\d+\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Hari terakhir dari kunci periode `YYYY-MM`. */
function endOfPeriodMonth(periodKey: string): string {
  const [year, month] = periodKey.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return '';
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${periodKey}-${String(lastDay).padStart(2, '0')}`;
}

/**
 * Versi berikutnya untuk "Simpan sebagai versi baru".
 * `1.0` → `1.1`, `1.9` → `1.10`, `2.3` → `2.4`, `abc` → `1.1`.
 */
export function nextVersionLabel(current: string): string {
  const match = (current ?? '').trim().match(/^(\d+)(?:[.,](\d+))?$/);
  if (!match) return '1.1';
  const major = Number(match[1]);
  const minor = match[2] === undefined ? 0 : Number(match[2]);
  return `${major}.${minor + 1}`;
}

