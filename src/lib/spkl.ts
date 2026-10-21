import { SpklType } from '@prisma/client';

/**
 * Helper perhitungan & validasi modul SPKL (Surat Perintah Kerja Lembur).
 *
 * Semua perhitungan jam dilakukan di server — nilai jam dari client TIDAK
 * pernah dipercaya (lihat `createSpkl`/`updateSpkl` di `services/spkl.service`).
 *
 * Batasan hukum mengikuti PP 35/2021:
 *  - maks 4 jam lembur per hari per pekerja
 *  - maks 18 jam per minggu per pekerja (di luar lembur hari libur resmi)
 *  - maks 72 jam per bulan per pekerja (di luar lembur hari libur resmi)
 */

export const PP35_MAX_HOURS_PER_DAY = 4;
export const PP35_MAX_HOURS_PER_WEEK = 18;
export const PP35_MAX_HOURS_PER_MONTH = 72;

export const SPKL_MIN_DATE = new Date(Date.UTC(2020, 0, 1));

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Cek format jam "HH:mm" (00:00–23:59). */
export function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

/** Ubah "HH:mm" menjadi jumlah menit sejak 00:00. */
export function timeToMinutes(value: string): number {
  const match = TIME_PATTERN.exec(value);
  if (!match) throw new Error(`Format jam tidak valid: ${value}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Hitung jumlah jam dari `startTime`–`endTime` (format "HH:mm").
 * Toleran lewat tengah malam: bila `endTime` < `startTime`, dianggap
 * melewati hari berikutnya (+24 jam). Jam mulai = jam selesai menghasilkan 0
 * (ditolak oleh validasi "jam harus lebih dari 0").
 * Hasil dibulatkan 2 desimal supaya konsisten dengan kolom Decimal(5,2).
 *
 * Contoh: 16:00–17:05 → 1.08 ; 23:30–00:30 → 1
 */
export function computeHours(start: string, end: string): number {
  const startMinutes = timeToMinutes(start);
  let endMinutes = timeToMinutes(end);

  if (endMinutes < startMinutes) endMinutes += 24 * 60;

  const hours = (endMinutes - startMinutes) / 60;
  return Math.round(hours * 100) / 100;
}

/** Bulatkan nilai jam (number/Decimal/string) ke 2 desimal. */
export function roundHours(value: number | string): number {
  return Math.round(Number(value) * 100) / 100;
}

/** Jumlahkan jam dari daftar item (masing-masing dibulatkan 2 desimal). */
export function computeTotal(items: { hours: number | string }[]): number {
  const total = items.reduce((sum, item) => sum + roundHours(item.hours), 0);
  return Math.round(total * 100) / 100;
}

/**
 * Nomor SPKL: `<urut 3 digit>/SPKL/<workUnit>/<tahun>` — contoh `001/SPKL/FMWR/2026`.
 */
export function formatSpklNumber(sequence: number, workUnit: string | null | undefined, year: number): string {
  const unit = (workUnit || 'PUSAT').trim().toUpperCase().replace(/\s+/g, '') || 'PUSAT';
  const seq = String(Math.max(1, Math.trunc(sequence))).padStart(3, '0');
  return `${seq}/SPKL/${unit}/${year}`;
}

/** Ambil nomor urut dari nomor SPKL (`001/SPKL/FMWR/2026` → 1). */
export function parseSpklSequence(number: string): number {
  const seq = Number.parseInt(number.split('/')[0] ?? '', 10);
  return Number.isFinite(seq) ? seq : 0;
}

/** Kunci tanggal `YYYY-MM-DD` (berbasis UTC — tanggal disimpan sebagai UTC midnight). */
export function toDateKey(value: Date | string): string {
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    return toDateKey(new Date(value));
  }
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const INDONESIAN_MONTHS = [
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
];

/** Format tanggal Indonesia: `24 Juni 2026`. */
export function formatDateIndonesian(value: Date | string): string {
  const [year, month, day] = toDateKey(value).split('-');
  return `${Number(day)} ${INDONESIAN_MONTHS[Number(month) - 1]} ${year}`;
}

/** Awal minggu (Senin) dari sebuah tanggal, sebagai kunci `YYYY-MM-DD`. */
export function getWeekStartKey(value: Date | string): string {
  const key = toDateKey(value);
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay(); // 0 = Minggu
  const diff = weekday === 0 ? 6 : weekday - 1;
  date.setUTCDate(date.getUTCDate() - diff);
  return toDateKey(date);
}

/** Awal & akhir minggu (Senin–Minggu) dari sebuah tanggal. */
export function getWeekRange(value: Date | string): { start: string; end: string } {
  const startKey = getWeekStartKey(value);
  const [year, month, day] = startKey.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return { start: startKey, end: toDateKey(end) };
}

/** Kunci bulan `YYYY-MM`. */
export function getMonthKey(value: Date | string): string {
  return toDateKey(value).slice(0, 7);
}

/** Item yang ikut dihitung dalam batas mingguan/bulanan PP 35/2021. */
export interface Pp35HourItem {
  workerNik: string;
  workerName: string;
  workDate: Date | string;
  hours: number | string;
  /** Jenis lembur SPKL asal item (PUBLIC_HOLIDAY dikecualikan dari batas minggu/bulan). */
  type?: SpklType | string | null;
}

export interface Pp35ValidationResult {
  errors: string[];
  warnings: string[];
}

function isPublicHoliday(type?: SpklType | string | null): boolean {
  return type === SpklType.PUBLIC_HOLIDAY || type === 'PUBLIC_HOLIDAY';
}

function groupSum(
  items: Pp35HourItem[],
  keyFn: (item: Pp35HourItem) => string
): Map<string, { total: number; sample: Pp35HourItem }> {
  const groups = new Map<string, { total: number; sample: Pp35HourItem }>();

  for (const item of items) {
    const key = keyFn(item);
    const current = groups.get(key);
    if (current) {
      current.total = Math.round((current.total + roundHours(item.hours)) * 100) / 100;
    } else {
      groups.set(key, { total: roundHours(item.hours), sample: item });
    }
  }

  return groups;
}

/**
 * Validasi batas lembur PP 35/2021.
 *
 * @param items    item SPKL yang sedang dibuat/diubah
 * @param existing item SPKL lain milik user yang sama (status ON_PROGRESS/APPROVED)
 * @param options  `strict` mengubah peringatan mingguan/bulanan menjadi error
 *
 * Aturan:
 *  - > 4 jam/hari per pekerja → ERROR (ditolak)
 *  - > 18 jam/minggu per pekerja → WARNING (atau error bila strict)
 *  - > 72 jam/bulan per pekerja → WARNING (atau error bila strict)
 *  - Lembur hari libur resmi (PUBLIC_HOLIDAY) dikecualikan dari batas minggu/bulan
 */
export function validatePp35(
  items: Pp35HourItem[],
  existing: Pp35HourItem[] = [],
  options: { strict?: boolean } = {}
): Pp35ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Batas harian 4 jam — hanya untuk item yang sedang diinput.
  const daily = groupSum(items, (item) => `${item.workerNik}::${toDateKey(item.workDate)}`);
  for (const { total, sample } of daily.values()) {
    if (total > PP35_MAX_HOURS_PER_DAY) {
      errors.push(
        `Lembur ${sample.workerName} pada ${formatDateIndonesian(sample.workDate)} melebihi 4 jam/hari (PP 35/2021)`
      );
    }
  }

  // 2. Batas mingguan & bulanan — gabungkan item baru dengan SPKL lain yang masih berjalan.
  const relevantExisting = existing.filter((item) => !isPublicHoliday(item.type));
  const relevantNew = items.filter((item) => !isPublicHoliday(item.type));
  const combined = [...relevantExisting, ...relevantNew];

  const weekly = groupSum(combined, (item) => `${item.workerNik}::${getWeekStartKey(item.workDate)}`);
  for (const { total, sample } of weekly.values()) {
    if (total > PP35_MAX_HOURS_PER_WEEK) {
      const range = getWeekRange(sample.workDate);
      const message =
        `Total lembur ${sample.workerName} pada minggu ${formatDateIndonesian(range.start)}–` +
        `${formatDateIndonesian(range.end)} menjadi ${total} jam (batas 18 jam/minggu, PP 35/2021)`;
      if (options.strict) errors.push(message);
      else warnings.push(message);
    }
  }

  const monthly = groupSum(combined, (item) => `${item.workerNik}::${getMonthKey(item.workDate)}`);
  for (const { total, sample } of monthly.values()) {
    if (total > PP35_MAX_HOURS_PER_MONTH) {
      const monthKey = getMonthKey(sample.workDate);
      const [year, month] = monthKey.split('-').map(Number);
      const message =
        `Total lembur ${sample.workerName} pada ${INDONESIAN_MONTHS[month - 1]} ${year} menjadi ` +
        `${total} jam (batas 72 jam/bulan, PP 35/2021)`;
      if (options.strict) errors.push(message);
      else warnings.push(message);
    }
  }

  return { errors, warnings };
}

/**
 * Validasi rentang tanggal lembur: tidak sebelum 2020 dan tidak lebih dari 1 tahun
 * ke depan (dihitung dari hari ini).
 */
export function validateWorkDate(value: Date | string): string | null {
  const key = toDateKey(value);
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (Number.isNaN(date.getTime())) {
    return 'Tanggal lembur tidak valid';
  }

  if (date.getTime() < SPKL_MIN_DATE.getTime()) {
    return `Tanggal lembur ${formatDateIndonesian(value)} tidak boleh sebelum 1 Januari 2020`;
  }

  const maxDate = new Date();
  maxDate.setUTCFullYear(maxDate.getUTCFullYear() + 1);

  if (date.getTime() > maxDate.getTime()) {
    return `Tanggal lembur ${formatDateIndonesian(value)} tidak boleh lebih dari 1 tahun ke depan`;
  }

  return null;
}
