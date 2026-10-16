import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getAllUserQuotas } from '@/services/quota.service';

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const yearStr = searchParams.get('year');
  const year = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear();

  try {
    const data = await getAllUserQuotas(year);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Gagal memuat data kuota' },
      { status: 400 }
    );
  }
}
