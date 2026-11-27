import { NextResponse } from 'next/server';
import { verifyEmailSchema } from '@/schemas/profile.schema';
import { confirmEmailVerification } from '@/services/profile.service';

export async function POST(request: Request) {
  try {
    const { token } = verifyEmailSchema.parse(await request.json());
    const r = await confirmEmailVerification(token);
    return NextResponse.json({ success: true, message: 'Email berhasil diverifikasi', data: r });
  } catch (e) {
    const message = e instanceof Error && e.name !== 'ZodError' ? e.message : 'Tautan tidak valid';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
