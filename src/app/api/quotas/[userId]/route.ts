import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { isApiError, normalizeError } from '@/lib/api-error';
import { getUserQuotas, updateUserQuotaByMode } from '@/services/quota.service';
import { updateQuotaSchema } from '@/schemas/quota.schema';

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

/**
 * Ubah kuota cuti user.
 *
 * Body baru : `{ leaveTypeId?, year?, mode: 'TOTAL' | 'USED' | 'REMAINING', value }`
 * Body lama : `{ totalQuota, leaveTypeId?, year? }` → otomatis `mode = 'TOTAL'`.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, message: 'Forbidden: Admin only' }, { status: 403 });
  }

  const { userId } = await params;

  try {
    const text = await request.text();
    const body = text && text.trim().length > 0 ? JSON.parse(text) : {};
    const validated = updateQuotaSchema.parse(body);

    const year = validated.year ?? new Date().getFullYear();
    const mode = validated.mode ?? 'TOTAL';
    const value = mode === 'TOTAL' && validated.mode === undefined
      ? (validated.totalQuota as number)
      : (validated.value as number);

    const updated = await updateUserQuotaByMode(userId, {
      mode,
      value,
      year,
      leaveTypeId: validated.leaveTypeId,
    });

    return NextResponse.json({
      success: true,
      message: `Kuota cuti ${updated.leaveTypeName} berhasil diperbarui (mode ${mode}).`,
      data: {
        ...updated,
        totalQuota: updated.totalQuota,
        usedQuota: updated.usedQuota,
        remainingQuota: updated.remainingQuota,
      },
    });
  } catch (error) {
    if (isApiError(error)) {
      return NextResponse.json(
        { success: false, message: error.message, errors: error.details },
        { status: error.status }
      );
    }

    return NextResponse.json(
      { success: false, message: normalizeError(error, 'Gagal memperbarui kuota').message },
      { status: 400 }
    );
  }
}
