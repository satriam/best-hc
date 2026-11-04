import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { ApiError, normalizeError } from '@/lib/api-error';
import { getLaporanById } from '@/services/laporan.service';

/** GET /api/laporan/:id — detail laporan + payload tersimpan (untuk generate ulang). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const data = await getLaporanById(id, { withPayload: true });
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const { message } = normalizeError(error, 'Gagal membaca laporan');
    const status = error instanceof ApiError ? error.status : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}
