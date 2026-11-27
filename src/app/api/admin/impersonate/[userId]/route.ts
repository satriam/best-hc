import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAdminSession, createImpersonateToken, setImpersonateCookie } from '@/lib/auth';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;

  const admin = await getAdminSession();
  if (!admin || admin.role !== 'ADMIN') {
    return NextResponse.json({ success: false, message: 'Tidak diizinkan' }, { status: 403 });
  }

  if (userId === admin.id) {
    return NextResponse.json(
      { success: false, message: 'Tidak bisa login sebagai diri sendiri' },
      { status: 400 }
    );
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.deletedAt) {
    return NextResponse.json({ success: false, message: 'User tidak ditemukan' }, { status: 404 });
  }

  await prisma.impersonationLog.create({
    data: { adminId: admin.id, targetId: target.id },
  });

  const token = await createImpersonateToken({
    adminId: admin.id,
    adminName: admin.name,
    target: { id: target.id, name: target.name, email: target.email, role: target.role },
  });
  await setImpersonateCookie(token);

  return NextResponse.json({
    success: true,
    message: `Masuk sebagai ${target.name}`,
    data: { redirectTo: target.role === 'ADMIN' ? '/admin/dashboard' : '/dashboard' },
  });
}
