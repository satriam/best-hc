/** Helper presentasi + validasi ringan untuk UI Laporan Bulanan. */

import { periodLabelFromKey, MONTHS_ID } from '@/lib/laporan/format';

export const LAPORAN_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  selesai: 'Selesai',
};

/** Label status Indonesia; nilai tak dikenal ditampilkan apa adanya. */
export function laporanStatusLabel(status: string): string {
  return LAPORAN_STATUS_LABEL[status] ?? status;
}

/** Warna chip status: draft abu, selesai hijau (mengikuti tema best-hcm). */
export function laporanStatusClass(status: string): string {
  if (status === 'selesai') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-1 ring-emerald-300/50';
  }
  return 'bg-slate-100 text-slate-600 border-slate-200 ring-1 ring-slate-300/50';
}

/** `2026-11` → `November 2026`; nilai bukan kunci periode dikembalikan apa adanya. */
export function periodLabel(period: string): string {
  if (!period) return '—';
  return periodLabelFromKey(period);
}

/**
 * Tanggal ISO `2026-10-04` → `04 Oktober 2026` (gaya cover laporan).
 * Mengembalikan string kosong bila input tidak valid.
 */
export function formatDateIndo(iso: string): string {
  const match = (iso ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const [, year, month, day] = match;
  const monthIndex = Number(month) - 1;
  if (monthIndex < 0 || monthIndex > 11) return '';
  return `${day} ${MONTHS_ID[monthIndex]} ${year}`;
}

/**
 * Rentang periode untuk cover: `04 September - 03 Oktober 2026`.
 *
 * Bila kedua tanggal di tahun yang sama, tahun hanya ditulis sekali di akhir —
 * sama seperti contoh dokumen resmi.
 */
export function buildPeriodLabel(startIso: string, endIso: string): string {
  const start = formatDateIndo(startIso);
  const end = formatDateIndo(endIso);
  if (start && end) {
    const startYear = startIso.slice(0, 4);
    const endYear = endIso.slice(0, 4);
    const startText = startYear === endYear ? start.replace(/\s\d{4}$/, '') : start;
    return `${startText} - ${end}`;
  }
  if (start) return start;
  if (end) return end;
  return '';
}

/** Kunci periode `YYYY-MM` diambil dari tanggal akhir rentang (bulan penutup). */
export function periodKeyFromEnd(endIso: string): string {
  const match = (endIso ?? '').trim().match(/^(\d{4})-(0[1-9]|1[0-2])-\d{2}$/);
  return match ? `${match[1]}-${match[2]}` : '';
}

/** Awal bulan (tanggal 1) untuk saran periode berikutnya. */
export function firstDayOfMonthIso(reference: Date = new Date()): string {
  const year = reference.getFullYear();
  const month = String(reference.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

const MONTHS_LOWER = [
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
 * Tebak kunci periode `YYYY-MM` dari hasil parser.
 *
 * `metaGuess.period` adalah label rentang ("04 September - 03 Oktober 2026"),
 * sedangkan `meta.period` harus `YYYY-MM`. Urutan: bulan pada tanggal dokumen,
 * lalu bulan terakhir yang disebut di label periode (bulan laporan biasanya
 * bulan penutup rentang).
 */
export function guessPeriodKey(guess: {
  period?: string | null;
  date?: string | null;
}): string {
  const fromDate = monthKeyFromText(guess.date);
  if (fromDate) return fromDate;
  return monthKeyFromText(guess.period) ?? '';
}

function monthKeyFromText(text?: string | null): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();

  const yearMatches = [...lower.matchAll(/(19|20)\d{2}/g)];
  if (yearMatches.length === 0) return null;
  const year = yearMatches[yearMatches.length - 1][0];

  let bestIndex = -1;
  let bestMonth = -1;
  MONTHS_LOWER.forEach((name, index) => {
    const position = lower.lastIndexOf(name);
    if (position > bestIndex) {
      bestIndex = position;
      bestMonth = index;
    }
  });

  if (bestMonth < 0) {
    const iso = lower.match(/(19|20)\d{2}-(0[1-9]|1[0-2])/);
    if (iso) return iso[0];
    return null;
  }

  return `${year}-${String(bestMonth + 1).padStart(2, '0')}`;
}

/** Tanggal hari ini `YYYY-MM-DD` (lokal, bukan UTC agar tidak mundur sehari). */
export function todayIso(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Pesan error dari body JSON API (`{ message, issues }`) dengan fallback. */
export function apiErrorMessage(
  json: { message?: string; issues?: Array<{ message?: string }> } | null,
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

/** Apakah kunci periode berformat `YYYY-MM` dan bulannya valid. */
export function isPeriodKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value.trim());
}

/** Unduh blob sebagai file (tanpa membuka tab baru). */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Beri waktu browser memulai unduhan sebelum URL dilepas.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
