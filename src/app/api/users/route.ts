import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getAllUsers, createUser } from '@/services/user.service';
import { createUserSchema } from '@/schemas/user.schema';

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
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
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Gagal membuat user' },
      { status: 400 }
    );
  }
}
