import { NextResponse } from 'next/server';
import { getSession, clearSessionCookie } from '@/lib/auth';
import { getUserById } from '@/services/user.service';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }

  const user = await getUserById(session.id);
  if (!user) {
    await clearSessionCookie();
    return NextResponse.json(
      { success: false, message: 'Sesi pengguna tidak valid. Silakan login kembali.' },
      { status: 401 }
    );
  }

  return NextResponse.json({
    success: true,
    data: user,
  });
}
