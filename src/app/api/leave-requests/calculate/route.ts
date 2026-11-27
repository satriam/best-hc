import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { calculateLeaveDays } from '@/lib/calculation';
import { getHolidayDatesSet } from '@/services/holiday.service';
import { addDays, isSaturday, isSunday } from 'date-fns';
import { getSession } from '@/lib/auth';
import { countRosterWorkDays, toWorkRoster, type WorkRoster } from '@/lib/roster';

/**
 * Roster pemohon (karyawan SHIFT). `userId` di body hanya dipakai ADMIN
 * (mis. saat mengedit pengajuan orang lain); selain itu user yang login.
 */
async function resolveRoster(bodyUserId: unknown): Promise<WorkRoster | null> {
  const session = await getSession();
  if (!session) return null;
  const userId =
    session.role === 'ADMIN' && typeof bodyUserId === 'string' && bodyUserId.length > 0
      ? bodyUserId
      : session.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { workType: true, rosterPattern: true, rosterStartDate: true },
  });
  return toWorkRoster(user);
}

interface HolidayDetail {
  date: string;
  name: string;
}

function toDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function holidaysInRange(start: Date, end: Date): Promise<HolidayDetail[]> {
  const dbHolidays = await prisma.nationalHoliday.findMany({
    where: { date: { gte: start, lte: end } },
    orderBy: { date: 'asc' },
  });

  return dbHolidays.map((h) => ({ date: toDateKey(h.date), name: h.name }));
}

function countWeekendDays(start: Date, end: Date): number {
  let weekendDaysCount = 0;
  let curr = new Date(start);
  while (curr <= end) {
    if (isSaturday(curr) || isSunday(curr)) {
      weekendDaysCount++;
    }
    curr = addDays(curr, 1);
  }
  return weekendDaysCount;
}

/**
 * Hari libur di rentang: SHIFT = hari libur roster (L), NON_SHIFT = Sabtu/Minggu.
 * Nama field tetap `weekendDaysCount` demi kompatibilitas klien.
 */
function countOffDays(start: Date, end: Date, roster: WorkRoster | null): number {
  if (!roster) return countWeekendDays(start, end);
  const total = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  return Math.max(0, total - countRosterWorkDays(roster, start, end));
}

/** SHIFT: libur nasional tidak mengurangi hari cuti, jadi tidak ditampilkan. */
async function holidaysFor(start: Date, end: Date, roster: WorkRoster | null) {
  return roster ? [] : holidaysInRange(start, end);
}

const EMPTY = { success: true, totalDays: 0, holidaysInRange: [], weekendDaysCount: 0 };

export async function POST(request: Request) {
  try {
    const text = await request.text();
    const body = text && text.trim().length > 0 ? JSON.parse(text) : {};
    const { segments, leaveTypeIds, startDate, endDate, userId } = body;

    const [holidayDatesSet, roster] = await Promise.all([getHolidayDatesSet(), resolveRoster(userId)]);

    // ============ Bentuk BARU: segments[] (multi rentang, jenis per rentang) ============
    if (Array.isArray(segments) && segments.length > 0) {
      const typeIds: string[] = Array.from(
        new Set(
          segments
            .map((s: { leaveTypeId?: string }) => s.leaveTypeId)
            .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
        )
      );

      if (typeIds.length === 0) {
        return NextResponse.json({ ...EMPTY, segments: [] });
      }

      const leaveTypes = await prisma.leaveType.findMany({ where: { id: { in: typeIds } } });
      const leaveTypeMap = new Map(leaveTypes.map((lt) => [lt.id, lt]));

      const resultSegments: Array<{
        index: number;
        leaveTypeId: string;
        leaveTypeName: string | null;
        startDate: string;
        endDate: string;
        totalDays: number;
        holidaysInRange: HolidayDetail[];
        weekendDaysCount: number;
      }> = [];

      let grandTotal = 0;
      let grandWeekend = 0;
      const mergedHolidays = new Map<string, string>();

      for (let index = 0; index < segments.length; index++) {
        const segment = segments[index] as {
          leaveTypeId?: string;
          startDate?: string;
          endDate?: string;
        };
        const leaveType = segment.leaveTypeId ? leaveTypeMap.get(segment.leaveTypeId) : undefined;

        if (!segment.startDate || !segment.endDate) {
          resultSegments.push({
            index,
            leaveTypeId: segment.leaveTypeId ?? '',
            leaveTypeName: leaveType?.name ?? null,
            startDate: segment.startDate ?? '',
            endDate: segment.endDate ?? '',
            totalDays: 0,
            holidaysInRange: [],
            weekendDaysCount: 0,
          });
          continue;
        }

        const start = new Date(segment.startDate);
        const end = new Date(segment.endDate);

        if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
          resultSegments.push({
            index,
            leaveTypeId: segment.leaveTypeId ?? '',
            leaveTypeName: leaveType?.name ?? null,
            startDate: segment.startDate,
            endDate: segment.endDate,
            totalDays: 0,
            holidaysInRange: [],
            weekendDaysCount: 0,
          });
          continue;
        }

        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);

        // Hitung per segment memakai calculationType jenis cuti segment tersebut
        const totalDays = leaveType
          ? calculateLeaveDays(start, end, [leaveType.calculationType], holidayDatesSet, roster)
          : 0;

        const segHolidays = await holidaysFor(start, end, roster);
        segHolidays.forEach((h) => mergedHolidays.set(h.date, h.name));

        const weekendDaysCount = countOffDays(start, end, roster);

        grandTotal += totalDays;
        grandWeekend += weekendDaysCount;

        resultSegments.push({
          index,
          leaveTypeId: segment.leaveTypeId ?? '',
          leaveTypeName: leaveType?.name ?? null,
          startDate: segment.startDate.slice(0, 10),
          endDate: segment.endDate.slice(0, 10),
          totalDays,
          holidaysInRange: segHolidays,
          weekendDaysCount,
        });
      }

      const holidaysInRangeMerged = Array.from(mergedHolidays.entries())
        .map(([date, name]) => ({ date, name }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return NextResponse.json({
        success: true,
        totalDays: grandTotal,
        segments: resultSegments,
        holidaysInRange: holidaysInRangeMerged,
        weekendDaysCount: grandWeekend,
        workType: roster ? 'SHIFT' : 'NON_SHIFT',
      });
    }

    // ============ Bentuk LAMA: leaveTypeIds + startDate/endDate ============
    if (!leaveTypeIds || !Array.isArray(leaveTypeIds) || leaveTypeIds.length === 0) {
      return NextResponse.json(EMPTY);
    }

    if (!startDate || !endDate) {
      return NextResponse.json(EMPTY);
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
      return NextResponse.json(EMPTY);
    }

    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    const leaveTypes = await prisma.leaveType.findMany({
      where: { id: { in: leaveTypeIds } },
    });

    const calcTypes = leaveTypes.map((lt) => lt.calculationType);
    const totalDays = calculateLeaveDays(start, end, calcTypes, holidayDatesSet, roster);

    return NextResponse.json({
      success: true,
      totalDays,
      holidaysInRange: await holidaysFor(start, end, roster),
      weekendDaysCount: countOffDays(start, end, roster),
      workType: roster ? 'SHIFT' : 'NON_SHIFT',
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Gagal menghitung hari' },
      { status: 400 }
    );
  }
}
