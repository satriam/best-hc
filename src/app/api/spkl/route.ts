import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { SpklStatus, SpklType } from '@prisma/client';
import { createSpkl, getSpkls } from '@/services/spkl.service';
import { getSignerIdsForUser } from '@/services/spkl-signer.service';
import { createSpklSchema } from '@/schemas/spkl.schema';
import { normalizeError } from '@/lib/api-error';

function parseEnumValue<T extends Record<string, string>>(enumObject: T, value: string | null): T[keyof T] | undefined {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  return Object.values(enumObject).includes(upper as T[keyof T]) ? (upper as T[keyof T]) : undefined;
}

/** 403 untuk pelanggaran izin, 400 untuk kesalahan validasi (termasuk user tidak ditemukan). */
function errorStatus(message: string): number {
  return /forbidden/i.test(message) ? 403 : 400;
}

/** GET /api/spkl — USER hanya melihat miliknya (atau SPKL yang ia setujui), ADMIN semua. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const isAdmin = session.role === 'ADMIN';

  // Satu penyetuju bisa terhubung ke banyak user: semua user yang terkait
  // boleh melihat SPKL dengan `approverId` signer tersebut.
  const approverSignerIds = isAdmin ? undefined : await getSignerIdsForUser(session.id);

  const result = await getSpkls({
    userId: isAdmin ? searchParams.get('userId') || undefined : session.id,
    approverSignerIds,
    status: parseEnumValue(SpklStatus, searchParams.get('status')),
    type: parseEnumValue(SpklType, searchParams.get('type')),
    from: searchParams.get('from') || undefined,
    to: searchParams.get('to') || undefined,
    createdFrom: searchParams.get('createdFrom') || undefined,
    createdTo: searchParams.get('createdTo') || undefined,
    search: searchParams.get('search') || undefined,
    page: Number.parseInt(searchParams.get('page') || '1', 10) || 1,
    limit: Number.parseInt(searchParams.get('limit') || '10', 10) || 10,
  });

  return NextResponse.json({ success: true, ...result });
}

/** POST /api/spkl — buat SPKL baru (status DRAFT, atau ON_PROGRESS bila `submit: true`). */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  // `?strict=1` menjadikan peringatan PP 35/2021 mingguan/bulanan sebagai error (khusus ADMIN).
  const strict = searchParams.get('strict') === '1' && session.role === 'ADMIN';

  try {
    const text = await request.text();
    const body = text && text.trim().length > 0 ? JSON.parse(text) : {};
    const validated = createSpklSchema.parse(body);

    const { spkl, warnings } = await createSpkl(
      { id: session.id, role: session.role },
      validated,
      {
        strict,
        requesterId: session.role === 'ADMIN' ? validated.userId : undefined,
      }
    );

    return NextResponse.json({
      success: true,
      message: `SPKL ${spkl.number} berhasil dibuat`,
      data: spkl,
      warnings,
    });
  } catch (error: unknown) {
    const { message, issues } = normalizeError(error, 'Gagal membuat SPKL');
    return NextResponse.json({ success: false, message, issues }, { status: errorStatus(message) });
  }
}
