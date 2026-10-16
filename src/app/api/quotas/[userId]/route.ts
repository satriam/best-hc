import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getUserQuotas, updateUserAnnualQuota } from '@/services/quota.service';
import { updateQuotaSchema } from '@/schemas/user.schema';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { userId } = await params;
  if (session.role !== 'ADMIN' && session.id !== userId) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const yearStr = searchParams.get('year');
  const year = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear();

  const quotas = await getUserQuotas(userId, year);
  return NextResponse.json({ success: true, data: quotas });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const { userId } = await params;

  try {
    const text = await request.text();
    const body = text && text.trim().length > 0 ? JSON.parse(text) : {};
    const validated = updateQuotaSchema.parse(body);
    const year = body.year || new Date().getFullYear();

    const updated = await updateUserAnnualQuota(
      userId,
      year,
      validated.totalQuota,
      validated.leaveTypeId
    );

    return NextResponse.json({
      success: true,
      message: 'Kuota cuti user berhasil diperbarui',
      data: updated,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Gagal memperbarui kuota' },
      { status: 400 }
    );
  }
}
