import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getAllUsers, getUserOptions, createUser } from '@/services/user.service';
import { createUserSchema } from '@/schemas/user.schema';
import { normalizeError } from '@/lib/api-error';

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  // `?forSpkl=1` → daftar ringan (id, name, nip, position, workUnit) untuk
  // auto-isi form SPKL. Aman untuk semua user yang login; tanpa data sensitif.
  const { searchParams } = new URL(request.url);
  if (searchParams.get('forSpkl') === '1') {
    const options = await getUserOptions();
    return NextResponse.json({ success: true, data: options });
  }

  if (session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const users = await getAllUsers();
  return NextResponse.json({ success: true, data: users });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const validated = createUserSchema.parse(body);

    const newUser = await createUser(validated);

    return NextResponse.json({
      success: true,
      message: 'User berhasil dibuat',
      data: newUser,
    });
  } catch (error: unknown) {
    const { message, issues } = normalizeError(error, 'Gagal membuat user');
    return NextResponse.json({ success: false, message, issues }, { status: 400 });
  }
}
