/**
 * Periode kuota cuti per user.
 *
 * Tiap user punya tanggal reset sendiri (`users.quotaResetMonth` / `quotaResetDay`,
 * default 1 Januari). Periode kuota "tahun N" = tanggal reset di tahun N sampai
 * sehari sebelum tanggal reset di tahun N+1. Kolom `user_leave_quotas.year`
 * menyimpan N (tahun mulai periode).
 *
 * Tanggal reset dibatasi 1–28 supaya selalu ada di setiap bulan (termasuk Februari).
 * Tanggal cuti tersimpan sebagai tengah malam UTC (`new Date('YYYY-MM-DD')`), jadi
 * komponen tanggalnya dibaca dengan getter UTC. Hanya "hari ini" yang memakai jam WIB.
 */

export interface QuotaResetRule {
  /** 1–12 */
  resetMonth: number;
  /** 1–28 */
  resetDay: number;
}

export const DEFAULT_RESET_RULE: QuotaResetRule = { resetMonth: 1, resetDay: 1 };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Selisih zona waktu operasional (WIB, UTC+7) untuk menentukan "hari ini". */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

export function normalizeRule(rule?: Partial<QuotaResetRule> | null): QuotaResetRule {
  const month = Math.trunc(Number(rule?.resetMonth));
  const day = Math.trunc(Number(rule?.resetDay));
  return {
    resetMonth: month >= 1 && month <= 12 ? month : 1,
    resetDay: day >= 1 && day <= 28 ? day : 1,
  };
}

/** Tanggal kalender (month 1–12) sebagai tengah malam UTC — format tanggal cuti tersimpan. */
export function calendarDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** Tanggal hari ini menurut jam WIB, dalam format tanggal cuti tersimpan. */
export function todayWib(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() + WIB_OFFSET_MS);
  return calendarDate(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

/** Tahun mulai periode kuota yang memuat `date`. */
export function periodYearOf(date: Date, rule: QuotaResetRule = DEFAULT_RESET_RULE): number {
  const r = normalizeRule(rule);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const beforeReset = month < r.resetMonth || (month === r.resetMonth && day < r.resetDay);
  return beforeReset ? year - 1 : year;
}

/** Rentang periode kuota tahun `year` (inklusif). */
export function periodRange(year: number, rule: QuotaResetRule = DEFAULT_RESET_RULE) {
  const r = normalizeRule(rule);
  const start = calendarDate(year, r.resetMonth, r.resetDay);
  const nextStart = calendarDate(year + 1, r.resetMonth, r.resetDay);
  return { start, end: new Date(nextStart.getTime() - DAY_MS) };
}

/** Periode kuota yang sedang berjalan hari ini (WIB). */
export function currentPeriodYear(rule: QuotaResetRule = DEFAULT_RESET_RULE, now: Date = new Date()) {
  return periodYearOf(todayWib(now), rule);
}

/**
 * Pecah satu rentang tanggal di batas periode kuota.
 * 29 Des 2026 – 5 Jan 2027 (reset 1 Jan) → [29–31 Des 2026], [1–5 Jan 2027].
 * Rentang yang seluruhnya di satu periode dikembalikan apa adanya.
 */
export function splitRangeByPeriod(
  startDate: Date,
  endDate: Date,
  rule: QuotaResetRule = DEFAULT_RESET_RULE
): Array<{ startDate: Date; endDate: Date; periodYear: number }> {
  const pieces: Array<{ startDate: Date; endDate: Date; periodYear: number }> = [];
  if (endDate.getTime() < startDate.getTime()) {
    return [{ startDate, endDate, periodYear: periodYearOf(startDate, rule) }];
  }

  let cursor = startDate;
  // Batas aman: rentang cuti tidak mungkin melewati puluhan periode.
  for (let guard = 0; guard < 50; guard += 1) {
    const year = periodYearOf(cursor, rule);
    const { end } = periodRange(year, rule);
    if (endDate.getTime() <= end.getTime()) {
      pieces.push({ startDate: cursor, endDate, periodYear: year });
      return pieces;
    }
    pieces.push({ startDate: cursor, endDate: end, periodYear: year });
    cursor = new Date(end.getTime() + DAY_MS);
  }
  return pieces;
}
