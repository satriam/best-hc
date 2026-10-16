import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { syncHolidaysFromApi } from '@/services/holiday.service';

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const years = body.years || [2025, 2026];

    const totalSynced = await syncHolidaysFromApi(years);

    return NextResponse.json({
      success: true,
      message: `Berhasil sinkronisasi ${totalSynced} tanggal merah dari API untuk tahun ${years.join(', ')}`,
      totalSynced,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Gagal sinkronisasi dari API' },
      { status: 500 }
    );
  }
}
