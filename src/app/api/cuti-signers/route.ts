import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { CutiSignerRole } from '@prisma/client';
import { getAllCutiSigners, createCutiSigner } from '@/services/cuti-signer.service';
import { cutiSignerSchema } from '@/schemas/cuti-signer.schema';
import { normalizeError } from '@/lib/api-error';

function parseRole(value: string | null): CutiSignerRole | undefined {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  return upper === CutiSignerRole.KNOWING || upper === CutiSignerRole.APPROVER
    ? (upper as CutiSignerRole)
    : undefined;
}

/**
 * GET /api/cuti-signers?role=KNOWING|APPROVER&active=1
 * Daftar aktif boleh dilihat semua user login (dipakai cetak permohonan cuti).
 * `active=0` (termasuk nonaktif) khusus ADMIN.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const role = parseRole(searchParams.get('role'));
  const activeParam = searchParams.get('active');
  const activeOnly = activeParam === '0' ? false : true;

  if (!activeOnly && session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, message: 'Forbidden: Admin only' }, { status: 403 });
  }

  const data = await getAllCutiSigners({ role, activeOnly });
  return NextResponse.json({ success: true, data });
}

/** POST /api/cuti-signers — ADMIN only. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, message: 'Forbidden: Admin only' }, { status: 403 });
  }

  try {
    const text = await request.text();
    const body = text && text.trim().length > 0 ? JSON.parse(text) : {};
    const validated = cutiSignerSchema.parse(body);

    const created = await createCutiSigner(validated);

    return NextResponse.json({
      success: true,
      message: 'Penanda tangan cuti berhasil ditambahkan',
      data: created,
    });
  } catch (error: unknown) {
    const { message, issues } = normalizeError(error, 'Gagal menambahkan penanda tangan cuti');

    return NextResponse.json({ success: false, message, issues }, { status: 400 });
  }
}
