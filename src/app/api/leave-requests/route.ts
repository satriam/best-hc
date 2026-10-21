import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getLeaveRequests, createLeaveRequest } from '@/services/leave.service';
import { createLeaveRequestPayloadSchema } from '@/schemas/leave.schema';
import { LeaveStatus } from '@prisma/client';

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') as LeaveStatus | null;
  const leaveTypeId = searchParams.get('leaveTypeId') || undefined;
  const startDate = searchParams.get('startDate') || undefined;
  const endDate = searchParams.get('endDate') || undefined;
  const searchUser = searchParams.get('searchUser') || undefined;

  // USER can only see their own leave requests unless ADMIN
  const userIdFilter = session.role === 'ADMIN' ? searchParams.get('userId') || undefined : session.id;

  const data = await getLeaveRequests({
    userId: userIdFilter,
    leaveTypeId,
    status: status || undefined,
    startDate,
    endDate,
    searchUser,
  });

  return NextResponse.json({ success: true, data });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const text = await request.text();
    const body = text && text.trim().length > 0 ? JSON.parse(text) : {};

    const validatedData = createLeaveRequestPayloadSchema.parse(body);

    // ADMIN can create leave requests on behalf of another user
    const targetUserId =
      session.role === 'ADMIN' && validatedData.userId ? validatedData.userId : session.id;

    const result = await createLeaveRequest(targetUserId, validatedData);

    return NextResponse.json({
      success: true,
      message: 'Pengajuan cuti berhasil dibuat',
      data: result,
    });
  } catch (error: any) {
    // zod v4: daftar issue ada di `error.issues` (bukan `errors`)
    const issues = Array.isArray(error?.issues) ? error.issues : Array.isArray(error?.errors) ? error.errors : null;
    const message =
      issues && issues.length > 0
        ? issues.map((issue: { message?: string }) => issue.message).filter(Boolean).join('; ')
        : error.message || 'Gagal mengajukan cuti';
    return NextResponse.json(
      { success: false, message, issues: issues ?? undefined },
      { status: 400 }
    );
  }
}
