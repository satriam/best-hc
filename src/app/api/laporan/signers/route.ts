import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { LaporanSignerRole } from '@prisma/client';
import { getAllLaporanSigners, createLaporanSigner } from '@/services/laporan-signer.service';
import { laporanSignerSchema } from '@/schemas/laporan.schema';
import { normalizeError } from '@/lib/api-error';

function parseRole(value: string | null): LaporanSignerRole | undefined {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  return Object.values(LaporanSignerRole).includes(upper as LaporanSignerRole)
    ? (upper as LaporanSignerRole)
    : undefined;
}

/**
 * GET /api/laporan/signers?role=DIBUAT|DIPERIKSA|DISETUJUI&active=1
 * Semua user login boleh melihat penanda tangan aktif (dipakai form generate).
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const role = parseRole(searchParams.get('role'));
  const activeOnly = searchParams.get('active') === '0' ? false : true;

  if (!activeOnly && session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, message: 'Forbidden: Admin only' }, { status: 403 });
  }

  const data = await getAllLaporanSigners({ role, activeOnly });
  return NextResponse.json({ success: true, data });
}

/** POST /api/laporan/signers — ADMIN only. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, message: 'Forbidden: Admin only' }, { status: 403 });
  }

  try {
    const text = await request.text();
    const body = text && text.trim().length > 0 ? JSON.parse(text) : {};
    const validated = laporanSignerSchema.parse(body);
    const created = await createLaporanSigner(validated);

    return NextResponse.json({
      success: true,
      message: 'Penanda tangan laporan berhasil ditambahkan',
      data: created,
    });
  } catch (error: unknown) {
    const { message, issues } = normalizeError(error, 'Gagal menambahkan penanda tangan laporan');
    return NextResponse.json({ success: false, message, issues }, { status: 400 });
  }
}
