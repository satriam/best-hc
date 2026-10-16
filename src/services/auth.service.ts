import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { createSessionToken, setSessionCookie, clearSessionCookie } from '@/lib/auth';
import { LoginInput } from '@/schemas/auth.schema';

export async function loginUser(input: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (!user || user.deletedAt) {
    throw new Error('Email atau password salah');
  }

  const isPasswordValid = await bcrypt.compare(input.password, user.password);
  if (!isPasswordValid) {
    throw new Error('Email atau password salah');
  }

  const userPayload = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const token = await createSessionToken(userPayload);
  await setSessionCookie(token);

  return userPayload;
}

export async function logoutUser() {
  await clearSessionCookie();
}
