import { differenceInCalendarDays, isSaturday, isSunday, addDays } from 'date-fns';
import { CalculationType } from '@prisma/client';

export { CalculationType };

/**
 * Fallback / Default Libur Nasional Tahunan Tetap (MM-DD) & Spesifik (YYYY-MM-DD)
 */
export const INDONESIAN_NATIONAL_HOLIDAYS_SET = new Set([
  '01-01', '05-01', '06-01', '08-17', '12-25',
  '2026-01-01', '2026-01-16', '2026-02-17', '2026-03-19', '2026-03-20',
  '2026-03-21', '2026-03-22', '2026-03-23', '2026-04-03', '2026-04-05',
  '2026-05-01', '2026-05-14', '2026-05-27', '2026-05-31', '2026-06-01',
  '2026-06-16', '2026-08-17', '2026-08-25', '2026-12-25',
]);

/**
 * Memeriksa apakah suatu tanggal merupakan Tanggal Merah / Libur Nasional (Dinamis + Fallback)
 */
export function isNationalHoliday(date: Date, dbHolidaysSet?: Set<string>): boolean {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  const fullDateStr = `${year}-${month}-${day}`;
  const monthDayStr = `${month}-${day}`;

  if (dbHolidaysSet && dbHolidaysSet.has(fullDateStr)) {
    return true;
  }

  return (
    INDONESIAN_NATIONAL_HOLIDAYS_SET.has(fullDateStr) ||
    INDONESIAN_NATIONAL_HOLIDAYS_SET.has(monthDayStr)
  );
}

/**
 * Calculate total calendar days between start and end date (inclusive)
 */
export function calculateCalendarDays(startDate: Date, endDate: Date): number {
  if (endDate < startDate) return 0;
  return differenceInCalendarDays(endDate, startDate) + 1;
}

/**
 * Calculate total working days between start and end date (inclusive)
 * Excludes Saturdays, Sundays, AND Dynamic National Public Holidays / Cuti Bersama
 */
export function calculateWorkingDays(
  startDate: Date,
  endDate: Date,
  dbHolidaysSet?: Set<string>
): number {
  if (endDate < startDate) return 0;

  let workingDays = 0;
  let currentDate = new Date(startDate);
  const targetEndDate = new Date(endDate);

  currentDate.setHours(0, 0, 0, 0);
  targetEndDate.setHours(0, 0, 0, 0);

  while (currentDate <= targetEndDate) {
    const isWeekend = isSaturday(currentDate) || isSunday(currentDate);
    const isHoliday = isNationalHoliday(currentDate, dbHolidaysSet);

    if (!isWeekend && !isHoliday) {
      workingDays++;
    }

    currentDate = addDays(currentDate, 1);
  }

  return workingDays;
}

/**
 * Calculate leave days based on selected leave types calculation mode
 */
export function calculateLeaveDays(
  startDate: Date,
  endDate: Date,
  calculationTypes: (CalculationType | string)[],
  dbHolidaysSet?: Set<string>
): number {
  const isCalendar = calculationTypes.some(
    (type) => type === CalculationType.CALENDAR_DAYS || type === 'CALENDAR_DAYS'
  );

  if (isCalendar) {
    return calculateCalendarDays(startDate, endDate);
  } else {
    return calculateWorkingDays(startDate, endDate, dbHolidaysSet);
  }
}
