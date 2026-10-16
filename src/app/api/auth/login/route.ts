import { NextResponse } from 'next/server';
import { loginUser } from '@/services/auth.service';
import { loginSchema } from '@/schemas/auth.schema';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validatedData = loginSchema.parse(body);

    const user = await loginUser(validatedData);

    return NextResponse.json({
      success: true,
      message: 'Login berhasil',
      data: user,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Login gagal' },
      { status: 400 }
    );
  }
}
