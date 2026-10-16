import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getAllLeaveTypes, createLeaveType } from '@/services/leave-type.service';
import { leaveTypeSchema } from '@/schemas/leave-type.schema';

export async function GET() {
  const data = await getAllLeaveTypes();
  return NextResponse.json({ success: true, data });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, message: 'Forbidden: Admin only' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const validated = leaveTypeSchema.parse(body);

    const created = await createLeaveType(validated);
    return NextResponse.json({
      success: true,
      message: 'Jenis cuti berhasil ditambahkan',
      data: created,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Gagal membuat jenis cuti' },
      { status: 400 }
    );
  }
}
