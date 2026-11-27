import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { changePasswordSchema } from '@/schemas/profile.schema';
import { changePassword } from '@/services/profile.service';

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  try {
    const { currentPassword, newPassword } = changePasswordSchema.parse(await request.json());
    await changePassword(session.id, currentPassword, newPassword);
    return NextResponse.json({ success: true, message: 'Password berhasil diubah' });
  } catch (e) {
    const zod = e as { name?: string; issues?: { message?: string }[] };
    const message = zod?.name === 'ZodError'
      ? zod.issues?.[0]?.message ?? 'Data tidak valid'
      : e instanceof Error
      ? e.message
      : 'Gagal mengubah password';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
