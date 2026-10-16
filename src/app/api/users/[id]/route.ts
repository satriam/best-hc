import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getUserById, updateUser, deleteUser } from '@/services/user.service';
import { updateUserSchema } from '@/schemas/user.schema';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (session.role !== 'ADMIN' && session.id !== id) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const user = await getUserById(id);
  if (!user) {
    return NextResponse.json({ success: false, message: 'User tidak ditemukan' }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: user });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const validated = updateUserSchema.parse(body);

    const updated = await updateUser(id, validated);
    return NextResponse.json({
      success: true,
      message: 'User berhasil diperbarui',
      data: updated,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Gagal memperbarui user' },
      { status: 400 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    await deleteUser(id);
    return NextResponse.json({
      success: true,
      message: 'User berhasil dihapus',
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Gagal menghapus user' },
      { status: 400 }
    );
  }
}
