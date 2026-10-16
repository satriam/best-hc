import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getAllHolidays, createHoliday } from '@/services/holiday.service';

export async function GET() {
  const data = await getAllHolidays();
  return NextResponse.json({ success: true, data });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { date, name } = body;

    if (!date || !name) {
      return NextResponse.json(
        { success: false, message: 'Tanggal dan nama hari libur wajib diisi' },
        { status: 400 }
      );
    }

    const created = await createHoliday(date, name);
    return NextResponse.json({
      success: true,
      message: 'Hari libur nasional berhasil ditambahkan',
      data: created,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Gagal menambahkan hari libur' },
      { status: 400 }
    );
  }
}
