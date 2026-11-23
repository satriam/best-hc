import { NextResponse } from 'next/server';
import { resetPassword } from '@/services/auth.service';
import { resetPasswordSchema } from '@/schemas/auth.schema';

export async function POST(request: Request) {
  try {
    const { token, password } = resetPasswordSchema.parse(await request.json());
    await resetPassword(token, password);
    return NextResponse.json({ success: true, message: 'Password berhasil diubah' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal reset password';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
