import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  getCutiSignerById,
  updateCutiSigner,
  deleteCutiSigner,
} from '@/services/cuti-signer.service';
import { updateCutiSignerSchema } from '@/schemas/cuti-signer.schema';
import { normalizeError } from '@/lib/api-error';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const signer = await getCutiSignerById(id);

  if (!signer) {
    return NextResponse.json(
      { success: false, message: 'Penanda tangan tidak ditemukan' },
      { status: 404 }
    );
  }

  if (!signer.isActive && session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({ success: true, data: signer });
}

async function handleUpdate(request: Request, paramsPromise: Promise<{ id: string }>) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, message: 'Forbidden: Admin only' }, { status: 403 });
  }

  const { id } = await paramsPromise;

  try {
    const text = await request.text();
    const body = text && text.trim().length > 0 ? JSON.parse(text) : {};
    const validated = updateCutiSignerSchema.parse(body);

    const updated = await updateCutiSigner(id, validated);

    return NextResponse.json({
      success: true,
      message: 'Penanda tangan cuti berhasil diperbarui',
      data: updated,
    });
  } catch (error: unknown) {
    const { message, issues } = normalizeError(error, 'Gagal memperbarui penanda tangan cuti');
    const status = /^Penanda tangan tidak ditemukan/i.test(message) ? 404 : 400;
    return NextResponse.json({ success: false, message, issues }, { status });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleUpdate(request, params);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleUpdate(request, params);
}

/** DELETE — ADMIN only. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, message: 'Forbidden: Admin only' }, { status: 403 });
  }

  const { id } = await params;

  try {
    await deleteCutiSigner(id);

    return NextResponse.json({
      success: true,
      message: 'Penanda tangan cuti berhasil dihapus',
    });
  } catch (error: unknown) {
    const { message } = normalizeError(error, 'Gagal menghapus penanda tangan cuti');
    const status = /tidak ditemukan/i.test(message) ? 404 : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}
