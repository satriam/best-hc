import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { deleteHoliday } from '@/services/holiday.service';

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
    await deleteHoliday(id);
    return NextResponse.json({
      success: true,
      message: 'Hari libur berhasil dihapus',
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Gagal menghapus hari libur' },
      { status: 400 }
    );
  }
}
