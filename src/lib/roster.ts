/**
 * Pola roster kerja untuk karyawan SHIFT.
 *
 * Pola = deret huruf berulang, satu huruf per hari: `K` = kerja, `L` = libur.
 * Contoh "KKKKLL" = 4 hari kerja lalu 2 hari libur, berulang terus.
 * `startDate` = tanggal yang jatuh pada huruf pertama pola.
 *
 * Untuk karyawan SHIFT, cuti jenis "hari kerja" hanya menghitung hari `K`.
 * Hari `L` (libur roster) tidak memotong kuota. Libur nasional TIDAK dikecualikan
 * untuk SHIFT karena jadwal shift tetap berjalan di hari libur nasional.
 */

export interface WorkRoster {
  pattern: string;
  startDate: Date;
}

export const ROSTER_PATTERN_REGEX = /^[KL]{2,28}$/;

/** Pola roster umum untuk pilihan cepat di form admin. */
export const ROSTER_PRESETS: Array<{ label: string; pattern: string }> = [
  { label: '5 kerja / 2 libur', pattern: 'KKKKKLL' },
  { label: '6 kerja / 1 libur', pattern: 'KKKKKKL' },
  { label: '4 kerja / 2 libur', pattern: 'KKKKLL' },
  { label: '2 kerja / 2 libur', pattern: 'KKLL' },
  { label: '3 kerja / 1 libur', pattern: 'KKKL' },
  { label: '14 kerja / 7 libur', pattern: 'KKKKKKKKKKKKKKLLLLLLL' },
];

export function isValidRosterPattern(pattern: string | null | undefined): pattern is string {
  return !!pattern && ROSTER_PATTERN_REGEX.test(pattern) && pattern.includes('K');
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Nomor hari kalender (UTC) — tanggal cuti & roster tersimpan sebagai tengah malam UTC. */
function dayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / DAY_MS);
}

/**
 * Nomor hari kalender sebuah tanggal cuti. Tanggal tersimpan sebagai tengah malam UTC;
 * sebagian pemanggil sudah me-`setHours(0)` di zona lokal (mis. WIB = 17:00 UTC hari
 * sebelumnya). Tengah malam UTC dibaca dengan komponen UTC, selain itu komponen lokal,
 * supaya keduanya jatuh di tanggal yang sama.
 */
function calendarDay(date: Date): number {
  const utcMidnight = date.getUTCHours() === 0 && date.getUTCMinutes() === 0;
  if (utcMidnight) return dayNumber(date);
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
}

/** Apakah `date` hari kerja menurut roster. */
export function isRosterWorkDay(roster: WorkRoster, date: Date): boolean {
  const len = roster.pattern.length;
  const offset = calendarDay(date) - dayNumber(roster.startDate);
  const index = ((offset % len) + len) % len;
  return roster.pattern[index] === 'K';
}

/** Jumlah hari kerja roster di rentang inklusif. */
export function countRosterWorkDays(roster: WorkRoster, start: Date, end: Date): number {
  const from = calendarDay(start);
  const to = calendarDay(end);
  if (to < from) return 0;
  const base = dayNumber(roster.startDate);
  const len = roster.pattern.length;
  let count = 0;
  for (let day = from; day <= to; day += 1) {
    const index = (((day - base) % len) + len) % len;
    if (roster.pattern[index] === 'K') count += 1;
  }
  return count;
}

/** Bentuk WorkRoster dari kolom user; null bila bukan SHIFT atau data roster tidak lengkap. */
export function toWorkRoster(user: {
  workType?: string | null;
  rosterPattern?: string | null;
  rosterStartDate?: Date | null;
} | null | undefined): WorkRoster | null {
  if (!user || user.workType !== 'SHIFT') return null;
  if (!isValidRosterPattern(user.rosterPattern) || !user.rosterStartDate) return null;
  return { pattern: user.rosterPattern, startDate: user.rosterStartDate };
}
