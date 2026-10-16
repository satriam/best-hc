import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { resetAnnualQuotas } from '@/services/quota.service';

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, message: 'Unauthorized / Admin Only' }, { status: 401 });
  }

  try {
    const text = await request.text();
    const body = text && text.trim().length > 0 ? JSON.parse(text) : {};
    const year = body.year || new Date().getFullYear();

    const results = await resetAnnualQuotas(year);

    return NextResponse.json({
      success: true,
      message: `Auto-reset kuota tahunan untuk tahun ${year} berhasil dijalankan.`,
      data: results,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Gagal mereset kuota tahunan' },
      { status: 400 }
    );
  }
}
