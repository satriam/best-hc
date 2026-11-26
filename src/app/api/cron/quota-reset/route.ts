import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { resetDueQuotas } from '@/services/quota.service';

export const dynamic = 'force-dynamic';

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * GET /api/cron/quota-reset — dipanggil Vercel Cron tiap hari (lihat vercel.json).
 * Me-reset kuota cuti tahunan user yang periodenya sudah berganti (sesuai tanggal
 * reset masing-masing). Idempoten: user yang sudah di-reset dilewati.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ success: false, message: 'CRON_SECRET belum diisi' }, { status: 500 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = await resetDueQuotas();
    return NextResponse.json({ success: true, resetCount: results.length, data: results });
  } catch (error) {
    console.error('[cron/quota-reset]', error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Gagal reset kuota' },
      { status: 500 }
    );
  }
}
