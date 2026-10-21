import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { updateSpklStatus } from '@/services/spkl.service';
import { updateSpklStatusSchema } from '@/schemas/spkl.schema';
import { normalizeError } from '@/lib/api-error';

function errorStatus(message: string): number {
  if (/forbidden/i.test(message)) return 403;
  if (/tidak ditemukan/i.test(message)) return 404;
  return 400;
}

/** PATCH /api/spkl/[id]/status — APPROVED/REJECTED/CANCELLED/ON_PROGRESS. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const text = await request.text();
    const body = text && text.trim().length > 0 ? JSON.parse(text) : {};
    const validated = updateSpklStatusSchema.parse(body);

    const data = await updateSpklStatus(id, { id: session.id, role: session.role }, validated);

    return NextResponse.json({
      success: true,
      message: `Status SPKL berhasil diubah menjadi ${validated.status}`,
      data,
    });
  } catch (error: unknown) {
    const { message, issues } = normalizeError(error, 'Gagal mengubah status SPKL');
    return NextResponse.json({ success: false, message, issues }, { status: errorStatus(message) });
  }
}
