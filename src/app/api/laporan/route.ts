import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listLaporan } from '@/services/laporan.service';
import { laporanListQuerySchema } from '@/schemas/laporan.schema';

/** GET /api/laporan?period=YYYY-MM&status=draft|selesai — daftar laporan tersimpan. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = laporanListQuerySchema.safeParse({
    period: searchParams.get('period') ?? undefined,
    status: searchParams.get('status') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: 'Filter tidak valid (period YYYY-MM, status draft|selesai)' },
      { status: 422 }
    );
  }

  const data = await listLaporan(parsed.data);
  return NextResponse.json({ success: true, data });
}
