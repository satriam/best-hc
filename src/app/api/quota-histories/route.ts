import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getQuotaHistories } from '@/services/quota.service';

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const targetUserId =
    session.role === 'ADMIN'
      ? searchParams.get('userId') || undefined
      : session.id;

  const data = await getQuotaHistories(targetUserId);

  return NextResponse.json({ success: true, data });
}
