import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  getLeaveRequestById,
  updateLeaveRequest,
  deleteLeaveRequest,
} from '@/services/leave.service';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!id || id === 'undefined' || id === 'create') {
    return NextResponse.json(
      { success: false, message: 'ID Pengajuan cuti tidak valid' },
      { status: 400 }
    );
  }

  const leaveRequest = await getLeaveRequestById(id);

  if (!leaveRequest) {
    return NextResponse.json(
      { success: false, message: 'Pengajuan cuti tidak ditemukan dalam basis data' },
      { status: 404 }
    );
  }

  // Authorization check: User can only see their own leave requests unless ADMIN
  if (session.role !== 'ADMIN' && leaveRequest.userId !== session.id) {
    return NextResponse.json(
      { success: false, message: 'Anda tidak memiliki akses untuk melihat pengajuan cuti ini.' },
      { status: 403 }
    );
  }

  return NextResponse.json({ success: true, data: leaveRequest });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const text = await request.text();
    const body = text && text.trim().length > 0 ? JSON.parse(text) : {};

    const result = await updateLeaveRequest(
      id,
      session.id,
      session.role === 'ADMIN',
      body
    );

    return NextResponse.json({
      success: true,
      message: 'Pengajuan cuti berhasil diperbarui',
      data: result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Gagal memperbarui pengajuan' },
      { status: 400 }
    );
  }
}

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
    await deleteLeaveRequest(id, session.id, session.role === 'ADMIN');
    return NextResponse.json({
      success: true,
      message: 'Pengajuan cuti berhasil dihapus',
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Gagal menghapus pengajuan' },
      { status: 400 }
    );
  }
}
