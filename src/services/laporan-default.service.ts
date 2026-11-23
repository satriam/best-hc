/**
 * Default isian laporan bulanan (`laporan_defaults`, satu baris).
 *
 * Dipakai wizard untuk prefill: nama proyek, judul cover, judul dokumen, nomor
 * dokumen/SPPH, versi, dan pilihan penanda tangan. `GET` tidak pernah gagal
 * karena tabel kosong: nilai fallback diambil dari konstanta + master penanda
 * tangan, plus `suggestedPeriod` dari tanggal server (Asia/Jakarta).
 */

import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { periodLabelFromRange, suggestedPeriod } from '@/lib/laporan/format';
import { getDefaultSignerSelection } from '@/services/laporan-signer.service';
import type { LaporanDefaultsBody } from '@/schemas/laporan.schema';

/** Id baris tunggal. */
const DEFAULTS_ID = 'default';

/** Nilai bawaan (sama dengan `builtinDefaults()` di UI). */
export const BUILTIN_DEFAULTS = {
  projectName: 'Pekerjaan Jasa Joint Development',
  coverTitle: 'Digitalisasi Aplikasi Human Capital Operations',
  docTitle:
    'Laporan Pekerjaan Jasa Joint Developtment Digitalisasi Aplikasi Human Capital Operations',
  docNo: '',
  spphNo: '',
  version: '1.0',
} as const;

export interface LaporanSignerSelectionIds {
  dibuat: string;
  diperiksa: string;
  disetujui: string;
  disetujui2: string;
}

export interface LaporanDefaultsResponse {
  project: string;
  projectName: string;
  coverTitle: string;
  title: string;
  docTitle: string;
  docNo: string;
  spphNo: string;
  version: string;
  /** Bentuk datar (kontrak resmi). */
  dibuatSignerId: string;
  diperiksaSignerId: string;
  disetujuiSignerId: string;
  disetujui2SignerId: string;
  /** Bentuk UI: id per slot. */
  signers: LaporanSignerSelectionIds;
  /**
   * Periode yang disarankan: tanggal 4 bulan berjalan s.d. tanggal 3 bulan
   * berikutnya (WIB), mis. `{ start: "2026-11-04", end: "2026-12-03",
   * label: "04 November - 03 Desember 2026" }`.
   */
  suggestedPeriod: { start: string; end: string; label: string };
  /** Label ringkas `suggestedPeriod.label` (dipakai UI sebagai teks). */
  suggestedPeriodLabel: string;
  periodStart: string;
  periodEnd: string;
  /** `true` = baris default sudah pernah disimpan di server. */
  saved: boolean;
  updatedAt: string | null;
}

function text(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/** Susun respons defaults dari baris DB (bila ada) + fallback master. */
export async function getLaporanDefaults(): Promise<LaporanDefaultsResponse> {
  const [row, defaultSigners] = await Promise.all([
    prisma.laporanDefault.findUnique({ where: { id: DEFAULTS_ID } }),
    getDefaultSignerSelection(),
  ]);

  const signers: LaporanSignerSelectionIds = {
    dibuat: text(row?.dibuatSignerId) || defaultSigners.dibuat,
    diperiksa: text(row?.diperiksaSignerId) || defaultSigners.diperiksa,
    disetujui: text(row?.disetujuiSignerId) || defaultSigners.disetujui,
    disetujui2: text(row?.disetujui2SignerId) || defaultSigners.disetujui2,
  };

  const projectName = text(row?.projectName) || BUILTIN_DEFAULTS.projectName;
  const coverTitle = text(row?.coverTitle) || BUILTIN_DEFAULTS.coverTitle;
  const docTitle = text(row?.docTitle) || BUILTIN_DEFAULTS.docTitle;
  const period = suggestedPeriod();

  return {
    project: projectName,
    projectName,
    coverTitle,
    title: docTitle,
    docTitle,
    docNo: text(row?.docNo),
    spphNo: text(row?.spphNo),
    version: text(row?.version) || BUILTIN_DEFAULTS.version,
    dibuatSignerId: signers.dibuat,
    diperiksaSignerId: signers.diperiksa,
    disetujuiSignerId: signers.disetujui,
    disetujui2SignerId: signers.disetujui2,
    signers,
    suggestedPeriod: period,
    suggestedPeriodLabel: period.label,
    periodStart: period.start,
    periodEnd: period.end,
    saved: Boolean(row),
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}

/**
 * Simpan default (upsert baris tunggal). Menerima dua bentuk body:
 * kontrak resmi (`projectName`, `docTitle`, `dibuatSignerId`, …) dan bentuk UI
 * (`project`, `title`, `signers:{dibuat:”id”}`).
 */
export async function saveLaporanDefaults(
  body: LaporanDefaultsBody,
  updatedById: string | null
): Promise<LaporanDefaultsResponse> {
  const pick = (...values: (string | null | undefined)[]): string => {
    for (const value of values) {
      if (typeof value === 'string' && value.trim().length > 0) return value.trim();
    }
    return '';
  };

  const projectName = pick(body.projectName, body.project) || BUILTIN_DEFAULTS.projectName;
  const docTitle = pick(body.docTitle, body.title) || BUILTIN_DEFAULTS.docTitle;
  const coverTitle = pick(body.coverTitle) || BUILTIN_DEFAULTS.coverTitle;

  const data = {
    projectName,
    coverTitle,
    docTitle,
    docNo: pick(body.docNo) || null,
    spphNo: pick(body.spphNo) || null,
    version: pick(body.version) || BUILTIN_DEFAULTS.version,
    dibuatSignerId: pick(body.dibuatSignerId, body.signers?.dibuat) || null,
    diperiksaSignerId: pick(body.diperiksaSignerId, body.signers?.diperiksa) || null,
    disetujuiSignerId: pick(body.disetujuiSignerId, body.signers?.disetujui) || null,
    disetujui2SignerId: pick(body.disetujui2SignerId, body.signers?.disetujui2) || null,
    updatedById: updatedById ?? null,
  } satisfies Prisma.LaporanDefaultUncheckedUpdateInput;

  await prisma.laporanDefault.upsert({
    where: { id: DEFAULTS_ID },
    create: { id: DEFAULTS_ID, ...data },
    update: data,
  });

  return getLaporanDefaults();
}

/** Label periode dari dua tanggal ISO (dipakai UI saat menyimpan default). */
export function defaultPeriodLabel(start: string, end: string): string {
  return periodLabelFromRange(start, end);
}
