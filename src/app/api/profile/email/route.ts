import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { changeEmailSchema } from '@/schemas/profile.schema';
import { requestEmailVerification } from '@/services/profile.service';

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  try {
    const { newEmail, password } = changeEmailSchema.parse(await request.json());
    const r = await requestEmailVerification(session.id, password, newEmail, new URL(request.url).origin);
    return NextResponse.json({
      success: true,
      message: r.isChange
        ? `Tautan konfirmasi dikirim ke ${r.email}. Email baru aktif setelah dikonfirmasi.`
        : `Tautan verifikasi dikirim ke ${r.email}.`,
    });
  } catch (e) {
    const known = e instanceof Error && e.name !== 'ZodError';
    const message = known ? (e as Error).message : 'Data tidak valid';
    const status = /Terlalu|Tunggu/.test(message) ? 429 : 400;
    if (known && !/Password|Email|Terlalu|Tunggu|Pengguna/.test(message)) console.error('[profile/email]', e);
    return NextResponse.json({ success: false, message }, { status });
  }
}
