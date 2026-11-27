/**
 * Normalisasi payload laporan bulanan.
 *
 * Kontrak resmi (dipakai wizard/UI dan integrasi lain) berbentuk datar:
 *
 * ```
 * { projectName, coverTitle, docTitle, docNo, spphNo,
 *   periodStart:"YYYY-MM-DD", periodEnd:"YYYY-MM-DD", periodLabel, version,
 *   items:[{ id?, module, title, category:"pengembangan"|"pemeliharaan",
 *            status, percent, note, figureNo?, imageRef? }],
 *   signers:{ dibuatId, diperiksaId, disetujuiId } }
 * ```
 *
 * Payload lama (dipakai versi pertama fitur ini) tetap diterima dan
 * dinormalisasi — bukan dibalas 400:
 *
 * ```
 * { meta:{ project, title, period:"YYYY-MM", docNo, periodLabel, date },
 *   items:[{ modul, fitur, section, gambar, caption }],
 *   signers:{ dibuat:{ id } } }
 * ```
 *
 * Validasi bisnis: request hanya ditolak bila `projectName` atau `title` kosong.
 *
 * @see src/schemas/laporan.schema.ts (bentuk zod)
 */

import { ApiError } from '@/lib/api-error';
import { laporanPayloadSchema, type LaporanPayloadBody } from '@/schemas/laporan.schema';
import {
  deriveCoverTitle,
  formatTanggalIndonesia,
  periodKeyFromDate,
  periodLabelFromKey,
  periodLabelFromRange,
  suggestedPeriod,
} from '@/lib/laporan/format';
import type {
  LaporanInput,
  LaporanItemCategory,
  LaporanItemInput,
  LaporanPayload,
  LaporanSection,
  LaporanSignerData,
} from '@/lib/laporan/types';

/** Field item yang sudah dipetakan ke bentuk internal (sisanya → `extra`). */
const ITEM_KNOWN_KEYS = new Set([
  'id',
  'module',
  'modul',
  'title',
  'fitur',
  'category',
  'section',
  'status',
  'percent',
  'note',
  'figureNo',
  'imageRef',
  'gambar',
  'caption',
]);

function pickText(...values: (string | null | undefined)[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return '';
}

/** Judul cover default: judul dokumen tanpa embel-embel periode/SPPH. */
export { deriveCoverTitle } from '@/lib/laporan/format';

function toSection(category: string | undefined, section: string | undefined): LaporanSection {
  const raw = (category ?? section ?? '').trim().toLowerCase();
  if (raw === 'pemeliharaan' || raw === 'maintenance') return 'maintenance';
  return 'development';
}

/** Kategori balik untuk payload resmi. */
export function toCategory(section: LaporanSection | undefined): LaporanItemCategory {
  return section === 'maintenance' ? 'pemeliharaan' : 'pengembangan';
}

function normalizeItem(raw: NonNullable<LaporanPayloadBody['items']>[number]): LaporanItemInput | null {
  const modul = pickText(raw.module, raw.modul) || 'Umum';
  const fitur = pickText(raw.title, raw.fitur);
  const gambar = raw.gambar?.trim() || undefined;

  // Baris kosong (belum diisi) tidak ikut disimpan.
  if (!fitur && !gambar) return null;

  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!ITEM_KNOWN_KEYS.has(key)) extra[key] = value;
  }

  return {
    ...(raw.id ? { id: raw.id } : {}),
    modul,
    fitur: fitur || modul,
    ...(raw.status ? { status: raw.status } : {}),
    ...(raw.percent !== undefined && raw.percent !== null ? { percent: raw.percent } : {}),
    ...(raw.note ? { note: raw.note } : {}),
    section: toSection(raw.category, raw.section),
    ...(gambar ? { gambar } : {}),
    ...(raw.caption ? { caption: raw.caption } : {}),
    ...(raw.figureNo !== undefined ? { figureNo: String(raw.figureNo) } : {}),
    ...(raw.imageRef ? { imageRef: raw.imageRef } : {}),
    ...(Object.keys(extra).length > 0 ? { extra } : {}),
  };
}

/** Satu slot penanda tangan: id master (`dibuatId`) atau objek lama. */
function normalizeSignerSlot(
  id: string | null | undefined,
  legacy: LaporanSignerData | undefined
): LaporanSignerData | undefined {
  if (id && id.trim()) return { id: id.trim() };
  if (!legacy) return undefined;
  const nama = pickText(legacy.nama);
  const jabatan = pickText(legacy.jabatan);
  const instansi = pickText(legacy.instansi);
  const nip = pickText(legacy.nip);
  const legacyId = pickText(legacy.id);
  if (!nama && !jabatan && !instansi && !nip && !legacyId) return undefined;
  return {
    ...(legacyId ? { id: legacyId } : {}),
    nama,
    jabatan,
    instansi,
    ...(nip ? { nip } : {}),
  };
}

/**
 * Body request → bentuk internal `LaporanInput`.
 *
 * @throws ApiError 422 bila `projectName`/`title` kosong, 400 bila tipe field salah.
 */
export function normalizeLaporanPayload(body: unknown): LaporanInput {
  const parsed = laporanPayloadSchema.safeParse(body ?? {});
  if (!parsed.success) {
    throw new ApiError(
      parsed.error.issues[0]?.message || 'Payload laporan tidak valid',
      400,
      parsed.error.issues
    );
  }
  const data = parsed.data;
  const legacy = data.meta ?? {};

  const project = pickText(data.projectName, legacy.project, legacy.projectName);
  const title = pickText(data.docTitle, data.title, legacy.title, legacy.docTitle);

  if (!project) {
    throw new ApiError('Nama proyek (projectName) wajib diisi', 422);
  }
  if (!title) {
    throw new ApiError('Judul dokumen (title) wajib diisi', 422);
  }

  const periodStart = pickText(data.periodStart, legacy.periodStart);
  const periodEnd = pickText(data.periodEnd, legacy.periodEnd);
  const fallbackPeriod = suggestedPeriod();

  // Kunci unique `period` = bulan tanggal akhir periode (kalau ada).
  const legacyPeriod = pickText(legacy.period);
  const period =
    periodKeyFromDate(periodEnd) ||
    periodKeyFromDate(periodStart) ||
    (/^\d{4}-(0[1-9]|1[0-2])$/.test(legacyPeriod) ? legacyPeriod : '') ||
    periodKeyFromDate(fallbackPeriod.end) ||
    periodKeyFromDate(fallbackPeriod.start) ||
    '';

  const periodLabel =
    pickText(data.periodLabel, legacy.periodLabel) ||
    periodLabelFromRange(periodStart, periodEnd) ||
    periodLabelFromKey(period);

  const items = (data.items ?? [])
    .map(normalizeItem)
    .filter((item): item is LaporanItemInput => item !== null);

  const signersInput = data.signers ?? {};
  const signers = {
    dibuat: normalizeSignerSlot(signersInput.dibuatId, signersInput.dibuat),
    diperiksa: normalizeSignerSlot(signersInput.diperiksaId, signersInput.diperiksa),
    disetujui: normalizeSignerSlot(signersInput.disetujuiId, signersInput.disetujui),
    disetujui2: normalizeSignerSlot(signersInput.disetujui2Id, signersInput.disetujui2),
  };

  const hasSigners = Object.values(signers).some((slot) => slot !== undefined);

  return {
    meta: {
      project,
      title,
      coverTitle: pickText(data.coverTitle, legacy.coverTitle) || deriveCoverTitle(title),
      spphNo: pickText(data.spphNo, legacy.spphNo),
      docNo: pickText(data.docNo, legacy.docNo),
      period,
      periodLabel,
      periodStart,
      periodEnd,
      version: pickText(data.version, legacy.version) || '1.0',
      date: formatTanggalIndonesia(pickText(data.date, legacy.date)) || '',
    },
    items,
    ...(hasSigners ? { signers } : {}),
    ...(data.revisions && data.revisions.length > 0 ? { revisions: data.revisions } : {}),
    ...(data.intro && data.intro.length > 0 ? { intro: data.intro } : {}),
    ...(data.scope && data.scope.length > 0 ? { scope: data.scope } : {}),
  };
}

/** Payload tersimpan → kontrak resmi datar (respons `GET /api/laporan/[id]`). */
export function toOfficialPayload(payload: LaporanPayload): Record<string, unknown> {
  const { meta, items, signers } = payload;
  return {
    projectName: meta.project,
    coverTitle: meta.coverTitle ?? deriveCoverTitle(meta.title),
    docTitle: meta.title,
    docNo: meta.docNo ?? '',
    spphNo: meta.spphNo ?? '',
    periodStart: meta.periodStart ?? '',
    periodEnd: meta.periodEnd ?? '',
    periodLabel: meta.periodLabel ?? '',
    version: meta.version ?? '1.0',
    date: meta.date ?? '',
    items: items.map((item) => ({
      id: item.id,
      module: item.modul,
      title: item.fitur,
      category: toCategory(item.section),
      status: item.status ?? '',
      percent: item.percent ?? '',
      note: item.note ?? '',
      figureNo: item.figureNo,
      imageRef: item.imageRef,
      hasImage: Boolean(item.gambar),
      ...item.extra,
    })),
    signers: {
      dibuatId: signers?.dibuat?.id,
      diperiksaId: signers?.diperiksa?.id,
      disetujuiId: signers?.disetujui?.id,
      disetujui2Id: signers?.disetujui2?.id,
    },
  };
}
