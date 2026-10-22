import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { isApiError, normalizeError } from '@/lib/api-error';
import { quotaSyncSchema } from '@/schemas/quota.schema';
import { syncUserQuotasBulk } from '@/services/quota.service';

/**
 * `POST /api/quotas/sync` — sinkronisasi massal kuota cuti (ADMIN only).
 *
 * Body: `{ year?, mode: 'USED' | 'REMAINING', rows: [{ userId? | userEmail?,
 * leaveTypeId? | leaveTypeName?, value }] }` (maks 500 baris).
 *
 * All-or-nothing: satu baris tidak valid → 422 dan tidak ada perubahan ditulis.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, message: 'Forbidden: Admin only' }, { status: 403 });
  }

  try {
    const text = await request.text();
    const body = text && text.trim().length > 0 ? JSON.parse(text) : {};
    const validated = quotaSyncSchema.parse(body);

    const result = await syncUserQuotasBulk({
      mode: validated.mode,
      year: validated.year,
      rows: validated.rows,
    });

    return NextResponse.json({
      success: true,
      message: `Sinkronisasi kuota selesai: ${result.applied} baris diterapkan, ${result.skipped} baris dilewati.`,
      year: result.year,
      mode: result.mode,
      applied: result.applied,
      skipped: result.skipped,
      rows: result.rows,
      skippedRows: result.skippedRows,
    });
  } catch (error) {
    if (isApiError(error)) {
      return NextResponse.json(
        { success: false, message: error.message, errors: error.details },
        { status: error.status }
      );
    }

    return NextResponse.json(
      { success: false, message: normalizeError(error, 'Gagal menyinkronkan kuota').message },
      { status: 400 }
    );
  }
}
