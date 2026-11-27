import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getImpersonation, clearImpersonateCookie } from '@/lib/auth';

export async function POST() {
  const impersonation = await getImpersonation();

  if (impersonation) {
    await prisma.impersonationLog.updateMany({
      where: {
        adminId: impersonation.adminId,
        targetId: impersonation.target.id,
        endedAt: null,
      },
      data: { endedAt: new Date() },
    });
  }

  await clearImpersonateCookie();

  return NextResponse.json({ success: true, message: 'Kembali ke akun admin' });
}
