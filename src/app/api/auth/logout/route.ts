import { NextResponse } from 'next/server';
import { logoutUser } from '@/services/auth.service';

export async function POST() {
  await logoutUser();
  return NextResponse.json({
    success: true,
    message: 'Logout berhasil',
  });
}
