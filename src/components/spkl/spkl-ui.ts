import { formatDateIndonesian, toDateKey } from '@/lib/spkl';
import type { SpklStatusValue, SpklTypeValue } from './types';

/** Perusahaan alih daya default (sama dengan default backend). */
export const DEFAULT_COMPANY = 'PT Bukit Energi Servis Terpadu';

export const SPKL_TYPE_OPTIONS: Array<{
  value: SpklTypeValue;
  label: string;
  short: string;
  description: string;
}> = [
  {
    value: 'WORKDAY',
    label: 'Lembur Hari Kerja',
    short: 'Hari Kerja',
    description: 'Lembur setelah jam kerja pada hari kerja biasa.',
  },
  {
    value: 'OUTSIDE_WORKDAY',
    label: 'Lembur Diluar Hari Kerja',
    short: 'Diluar Hari Kerja',
    description: 'Lembur di luar jadwal hari kerja / shift.',
  },
  {
    value: 'PUBLIC_HOLIDAY',
    label: 'Lembur Hari Libur Resmi',
    short: 'Hari Libur Resmi',
    description: 'Lembur pada hari libur resmi / tanggal merah.',
  },
];

export const SPKL_TYPE_LABEL: Record<SpklTypeValue, string> = {
  WORKDAY: 'Lembur Hari Kerja',
  OUTSIDE_WORKDAY: 'Lembur Diluar Hari Kerja',
  PUBLIC_HOLIDAY: 'Lembur Hari Libur Resmi',
};

export const SPKL_STATUS_LABEL: Record<SpklStatusValue, string> = {
  DRAFT: 'Draf',
  ON_PROGRESS: 'Menunggu Persetujuan',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
  CANCELLED: 'Dibatalkan',
};

/** Warna badge status: DRAFT abu, ON_PROGRESS amber, APPROVED hijau, REJECTED merah, CANCELLED slate. */
export const SPKL_STATUS_CLASS: Record<SpklStatusValue, string> = {
  DRAFT: 'bg-slate-100 text-slate-600 border-slate-200 ring-1 ring-slate-300/50',
  ON_PROGRESS: 'bg-amber-50 text-amber-700 border-amber-200 ring-1 ring-amber-300/50',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-1 ring-emerald-300/50',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-200 ring-1 ring-rose-300/50',
  CANCELLED: 'bg-slate-200 text-slate-700 border-slate-300 ring-1 ring-slate-400/40',
};

/** Jam ditampilkan maksimal 2 desimal tanpa nol berlebih: 1 → "1", 1.08 → "1.08". */
export function formatHours(value: number | string | null | undefined): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0';
  return String(Math.round(numeric * 100) / 100);
}

/** Label jam lengkap: "1.08 Jam". */
export function formatHoursLabel(value: number | string | null | undefined): string {
  return `${formatHours(value)} Jam`;
}

/** Tanggal Indonesia: "24 Juni 2026". */
export function formatDateID(value: string | Date | null | undefined): string {
  if (!value) return '-';
  return formatDateIndonesian(value);
}

/** Nilai untuk `<input type="date">` (YYYY-MM-DD, tanpa pergeseran timezone). */
export function toDateInputValue(value: string | Date | null | undefined): string {
  if (!value) return '';
  return toDateKey(value);
}

/** Jam HH:mm dari data tersimpan; kosong bila tidak valid. */
export function toTimeValue(value: string | null | undefined): string {
  if (!value) return '';
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return '';
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

/** Pesan error pertama dari respons API (mendukung `issues` zod). */
export function apiErrorMessage(
  json: { message?: string; issues?: Array<{ message?: string; path?: Array<string | number> }> } | null,
  fallback: string
): string {
  if (!json) return fallback;
  if (Array.isArray(json.issues) && json.issues.length > 0) {
    const details = json.issues
      .map((issue) => issue.message)
      .filter((message): message is string => Boolean(message));
    if (details.length > 0) return details.join('; ');
  }
  return json.message || fallback;
}
