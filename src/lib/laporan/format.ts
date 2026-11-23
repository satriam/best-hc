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
  return `${buildLaporanFileBase(project, period)}_v${slugVersion(version)}.docx`;
}

/** Nama dasar tanpa versi (dipakai saat file lama di-rename `_v<versi>`). */
export function buildLaporanFileBase(project: string, period: string): string {
  const projectSlug = project.toUpperCase().includes('BUKIT ENERGI')
    ? 'BEST'
    : slugSegment(project).slice(0, 40);
  return `Laporan_${projectSlug}_${slugSegment(period)}`;
}

/** Potongan nama file aman (tanpa spasi/simbol). */
export function slugSegment(value: string): string {
  return (
    value
      .normalize('NFKD')
      .replace(/[^0-9A-Za-z]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'Laporan'
  );
}

function slugVersion(version: string): string {
  return slugSegment(version);
}

/** Dua digit: `4` → `04`. */
export function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Tanggal hari ini di zona Asia/Jakarta (server bisa berjalan di UTC). */
export function jakartaDateParts(now: Date = new Date()): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  return { year: read('year'), month: read('month'), day: read('day') };
}

/**
 * Periode laporan yang disarankan: tanggal **4 bulan berjalan** s.d. tanggal
 * **3 bulan berikutnya** (WIB), dengan label seperti `04 Oktober - 03 November 2026`.
 */
export function suggestedPeriod(now: Date = new Date()): {
  start: string;
  end: string;
  label: string;
} {
  const { year, month } = jakartaDateParts(now);
  const startYear = year;
  const startMonth = month;
  const endMonthIndex = (startMonth - 1 + 1) % 12;
  const endYear = startMonth === 12 ? startYear + 1 : startYear;

  return {
    start: `${startYear}-${pad2(startMonth)}-04`,
    end: `${endYear}-${pad2(endMonthIndex + 1)}-03`,
    label: `${pad2(4)} ${MONTHS_ID[startMonth - 1]} - ${pad2(3)} ${MONTHS_ID[endMonthIndex]} ${endYear}`,
  };
}

/** Kunci periode `YYYY-MM` dari tanggal ISO (`2026-11-03` → `2026-11`). */
export function periodKeyFromDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const match = iso.trim().match(/^(\d{4})-(\d{2})(?:-\d{2})?/);
  if (!match) return null;
  return `${match[1]}-${match[2]}`;
}

/** Label periode dari rentang ISO (`04 Oktober - 03 November 2026`). */
export function periodLabelFromRange(start: string, end: string): string {
  const matchStart = start.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const matchEnd = end.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matchStart || !matchEnd) return '';
  const startMonth = Number(matchStart[2]) - 1;
  const endMonth = Number(matchEnd[2]) - 1;
  if (startMonth < 0 || startMonth > 11 || endMonth < 0 || endMonth > 11) return '';
  return `${matchStart[3]} ${MONTHS_ID[startMonth]} - ${matchEnd[3]} ${MONTHS_ID[endMonth]} ${matchEnd[1]}`;
}

/**
 * Judul cover default: judul dokumen panjang tanpa embel-embel periode & SPPH.
 * (`Laporan Pekerjaan ... Periode 04 Oktober - 03 November 2026` → tanpa periode)
 */
export function deriveCoverTitle(title: string): string {
  return title
    .replace(/\s*periode\s+\d{1,2}\s+[A-Za-z]+\s*[-–—]\s*\d{1,2}\s+[A-Za-z]+\s+\d{4}\s*/gi, ' ')
    .replace(/\s*SPPH\s*\d+\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
