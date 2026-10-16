import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { calculateLeaveDays } from '@/lib/calculation';
import { getHolidayDatesSet } from '@/services/holiday.service';
import { addDays, isSaturday, isSunday } from 'date-fns';

export async function POST(request: Request) {
  try {
    const text = await request.text();
    const body = text && text.trim().length > 0 ? JSON.parse(text) : {};
    const { leaveTypeIds, startDate, endDate } = body;

    if (!leaveTypeIds || !Array.isArray(leaveTypeIds) || leaveTypeIds.length === 0) {
      return NextResponse.json({ success: true, totalDays: 0, holidaysInRange: [], weekendDaysCount: 0 });
    }

    if (!startDate || !endDate) {
      return NextResponse.json({ success: true, totalDays: 0, holidaysInRange: [], weekendDaysCount: 0 });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
      return NextResponse.json({ success: true, totalDays: 0, holidaysInRange: [], weekendDaysCount: 0 });
    }

    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    const leaveTypes = await prisma.leaveType.findMany({
      where: { id: { in: leaveTypeIds } },
    });

    const holidayDatesSet = await getHolidayDatesSet();

    const calcTypes = leaveTypes.map((lt) => lt.calculationType);
    const totalDays = calculateLeaveDays(start, end, calcTypes, holidayDatesSet);

    // Fetch details of national holidays within date range
    const dbHolidays = await prisma.nationalHoliday.findMany({
      where: {
        date: {
          gte: start,
          lte: end,
        },
      },
      orderBy: { date: 'asc' },
    });

    const holidaysInRange = dbHolidays.map((h) => {
      const year = h.date.getFullYear();
      const month = String(h.date.getMonth() + 1).padStart(2, '0');
      const day = String(h.date.getDate()).padStart(2, '0');
      return {
        date: `${year}-${month}-${day}`,
        name: h.name,
      };
    });

    // Count weekends in range
    let weekendDaysCount = 0;
    let curr = new Date(start);
    while (curr <= end) {
      if (isSaturday(curr) || isSunday(curr)) {
        weekendDaysCount++;
      }
      curr = addDays(curr, 1);
    }

    return NextResponse.json({
      success: true,
      totalDays,
      holidaysInRange,
      weekendDaysCount,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Gagal menghitung hari' },
      { status: 400 }
    );
  }
}
