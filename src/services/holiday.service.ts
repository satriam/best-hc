import { prisma } from '@/lib/db';

export async function getAllHolidays() {
  const holidays = await prisma.nationalHoliday.findMany({
    orderBy: { date: 'asc' },
  });

  // Auto-sync from upset.dev API if database table is empty
  if (holidays.length === 0) {
    await syncHolidaysFromApi([2025, 2026]);
    return prisma.nationalHoliday.findMany({
      orderBy: { date: 'asc' },
    });
  }

  return holidays;
}

export async function syncHolidaysFromApi(years: number[] = [2025, 2026]): Promise<number> {
  let count = 0;

  for (const year of years) {
    try {
      const res = await fetch(`https://tanggalmerah.upset.dev/api/holidays?year=${year}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!res.ok) continue;

      const text = await res.text();
      if (!text || text.trim().length === 0) continue;

      const json = JSON.parse(text);

      if (json.success && Array.isArray(json.data)) {
        for (const item of json.data) {
          if (!item.date || !item.name) continue;

          // Parse date string (YYYY-MM-DD)
          const date = new Date(`${item.date}T00:00:00.000Z`);

          await prisma.nationalHoliday.upsert({
            where: { date },
            update: { name: item.name },
            create: { date, name: item.name },
          });

          count++;
        }
      }
    } catch (err) {
      console.error(`Gagal sync tanggal merah dari API untuk tahun ${year}:`, err);
    }
  }

  return count;
}

export async function getHolidayDatesSet(): Promise<Set<string>> {
  let holidays = await prisma.nationalHoliday.findMany({
    select: { date: true },
  });

  if (holidays.length === 0) {
    await syncHolidaysFromApi([2025, 2026]);
    holidays = await prisma.nationalHoliday.findMany({
      select: { date: true },
    });
  }

  const set = new Set<string>();
  for (const h of holidays) {
    const year = h.date.getFullYear();
    const month = String(h.date.getMonth() + 1).padStart(2, '0');
    const day = String(h.date.getDate()).padStart(2, '0');
    set.add(`${year}-${month}-${day}`);
  }

  return set;
}

export async function createHoliday(dateStr: string, name: string) {
  const date = new Date(`${dateStr}T00:00:00.000Z`);

  const existing = await prisma.nationalHoliday.findUnique({
    where: { date },
  });

  if (existing) {
    throw new Error('Tanggal libur ini sudah ada di database');
  }

  return prisma.nationalHoliday.create({
    data: {
      date,
      name,
    },
  });
}

export async function deleteHoliday(id: string) {
  return prisma.nationalHoliday.delete({
    where: { id },
  });
}
