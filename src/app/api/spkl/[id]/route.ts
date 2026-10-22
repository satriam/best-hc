import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { deleteSpkl, getSpklById, updateSpkl } from '@/services/spkl.service';
import { updateSpklSchema } from '@/schemas/spkl.schema';
import { normalizeError } from '@/lib/api-error';

function errorStatus(message: string): number {
  if (/forbidden/i.test(message)) return 403;
  if (/tidak ditemukan/i.test(message)) return 404;
  return 400;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const data = await getSpklById(id, { id: session.id, role: session.role });

    if (!data) {
      return NextResponse.json({ success: false, message: 'SPKL tidak ditemukan' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const { message } = normalizeError(error, 'Gagal mengambil SPKL');
    return NextResponse.json({ success: false, message }, { status: errorStatus(message) });
  }
}

/** PATCH — edit SPKL (hanya DRAFT/ON_PROGRESS, pemilik atau ADMIN). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const strict = searchParams.get('strict') === '1' && session.role === 'ADMIN';

  try {
    const text = await request.text();
    const body = text && text.trim().length > 0 ? JSON.parse(text) : {};
    const validated = updateSpklSchema.parse(body);

    const { spkl, warnings } = await updateSpkl(
      id,
      { id: session.id, role: session.role },
      validated,
      { strict }
    );

    return NextResponse.json({
      success: true,
      message: 'SPKL berhasil diperbarui',
      data: spkl,
      warnings,
    });
  } catch (error: unknown) {
    const { message, issues } = normalizeError(error, 'Gagal memperbarui SPKL');
    return NextResponse.json({ success: false, message, issues }, { status: errorStatus(message) });
  }
}

/** DELETE — soft delete (`deletedAt`), hanya DRAFT & pemilik/ADMIN. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    await deleteSpkl(id, { id: session.id, role: session.role });
    return NextResponse.json({ success: true, message: 'SPKL berhasil dihapus' });
  } catch (error: unknown) {
    const { message } = normalizeError(error, 'Gagal menghapus SPKL');
    return NextResponse.json({ success: false, message }, { status: errorStatus(message) });
  }
}
