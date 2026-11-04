/** Format tanggal & periode gaya Indonesia untuk laporan bulanan. */

export const MONTHS_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const;

/**
 * Ubah input tanggal menjadi `5 Oktober 2026`.
 *
 * Menerima ISO (`2026-10-05`), `Date`, atau teks yang sudah berformat Indonesia
 * (dikembalikan apa adanya supaya form boleh mengirim label bebas).
 */
export function formatTanggalIndonesia(input?: string | Date | null): string {
  if (!input) return '';
  if (input instanceof Date) {
    return `${input.getDate()} ${MONTHS_ID[input.getMonth()]} ${input.getFullYear()}`;
  }

  const text = input.trim();
  if (!text) return '';

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, year, month, day] = iso;
    const monthIndex = Number(month) - 1;
    if (monthIndex >= 0 && monthIndex < 12) {
      return `${Number(day)} ${MONTHS_ID[monthIndex]} ${year}`;
    }
  }

  // Sudah berupa label Indonesia ("5 Oktober 2026") — biarkan.
  return text;
}

/** `2026-09` → `September 2026`. */
export function periodLabelFromKey(period: string): string {
  const match = period.match(/^(\d{4})-(\d{1,2})$/);
  if (!match) return period;
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return period;
  return `${MONTHS_ID[monthIndex]} ${match[1]}`;
}

/** Validasi kunci periode `YYYY-MM`. */
export function isPeriodKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Nama file arsip: `Laporan_BEST_2026-09_v1.0.docx` (tanpa spasi/simbol aneh). */
export function buildLaporanFileName(project: string, period: string, version: string): string {
  const slug = (value: string) =>
    value
      .normalize('NFKD')
      .replace(/[^0-9A-Za-z]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'Laporan';
  const projectSlug = project.toUpperCase().includes('BUKIT ENERGI') ? 'BEST' : slug(project).slice(0, 40);
  return `Laporan_${projectSlug}_${slug(period)}_v${slug(version)}.docx`;
}
