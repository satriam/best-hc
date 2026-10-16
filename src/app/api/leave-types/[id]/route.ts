import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  getLeaveTypeById,
  updateLeaveType,
  deleteLeaveType,
} from '@/services/leave-type.service';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const leaveType = await getLeaveTypeById(id);

  if (!leaveType) {
    return NextResponse.json(
      { success: false, message: 'Jenis cuti tidak ditemukan' },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, data: leaveType });
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
    const updated = await updateLeaveType(id, body);

    return NextResponse.json({
      success: true,
      message: 'Jenis cuti berhasil diperbarui',
      data: updated,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Gagal memperbarui jenis cuti' },
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
    await deleteLeaveType(id);
    return NextResponse.json({
      success: true,
      message: 'Jenis cuti berhasil dihapus',
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Gagal menghapus jenis cuti' },
      { status: 400 }
    );
  }
}
