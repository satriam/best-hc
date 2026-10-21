import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { SpklSignerRole } from '@prisma/client';
import { getAllSpklSigners, createSpklSigner } from '@/services/spkl-signer.service';
import { spklSignerSchema } from '@/schemas/spkl.schema';
import { normalizeError } from '@/lib/api-error';

function parseRole(value: string | null): SpklSignerRole | undefined {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  return upper === SpklSignerRole.PIC || upper === SpklSignerRole.APPROVER
    ? (upper as SpklSignerRole)
    : undefined;
}

/** GET /api/spkl-signers?role=PIC|APPROVER&active=1 — semua user login boleh melihat daftar. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const role = parseRole(searchParams.get('role'));
  const activeParam = searchParams.get('active');
  // Default: hanya yang aktif. `active=0` menampilkan semua (khusus ADMIN).
  const activeOnly = activeParam === '0' ? false : true;

  if (!activeOnly && session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, message: 'Forbidden: Admin only' }, { status: 403 });
  }

  const data = await getAllSpklSigners({ role, activeOnly });
  return NextResponse.json({ success: true, data });
}

/** POST /api/spkl-signers — ADMIN only. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, message: 'Forbidden: Admin only' }, { status: 403 });
  }

  try {
    const text = await request.text();
    const body = text && text.trim().length > 0 ? JSON.parse(text) : {};
    const validated = spklSignerSchema.parse(body);

    const created = await createSpklSigner(validated);

    return NextResponse.json({
      success: true,
      message: 'Penanda tangan berhasil ditambahkan',
      data: created,
    });
  } catch (error: unknown) {
    const { message, issues } = normalizeError(error, 'Gagal menambahkan penanda tangan');

    return NextResponse.json({ success: false, message, issues }, { status: 400 });
  }
}
