import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { updateLeaveStatus } from '@/services/leave.service';
import { updateLeaveStatusSchema } from '@/schemas/leave.schema';

export async function PATCH(
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
    const validated = updateLeaveStatusSchema.parse(body);

    // Allow status updates for all users
    const updated = await updateLeaveStatus(id, validated.status, validated.adminNote);

    return NextResponse.json({
      success: true,
      message: `Status pengajuan berhasil diubah menjadi ${validated.status}`,
      data: updated,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Gagal mengubah status pengajuan' },
      { status: 400 }
    );
  }
}
