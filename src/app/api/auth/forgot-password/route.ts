import { NextResponse } from 'next/server';
import { requestPasswordReset } from '@/services/auth.service';
import { forgotPasswordSchema } from '@/schemas/auth.schema';

const OK = {
  success: true,
  message: 'Tautan reset password telah dikirim ke email Anda.',
};

export async function POST(request: Request) {
  let email: string;
  try {
    email = forgotPasswordSchema.parse(await request.json()).email;
  } catch {
    return NextResponse.json({ success: false, message: 'Email tidak valid' }, { status: 400 });
  }
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      null;
    await requestPasswordReset(email, new URL(request.url).origin, ip);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Gagal mengirim email';
    const known = message === 'Email tidak terdaftar' || message.startsWith('Tunggu') || message.startsWith('Terlalu');
    if (!known) console.error('[forgot-password]', e);
    return NextResponse.json(
      { success: false, message: known ? message : 'Gagal mengirim email. Coba lagi nanti.' },
      { status: !known ? 500 : message === 'Email tidak terdaftar' ? 404 : 429 }
    );
  }
  return NextResponse.json(OK);
}
