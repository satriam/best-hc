import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { Role } from '@prisma/client';

export interface UserPayload {
  id: string;
  name: string;
  email: string;
  role: Role;
}

const JWT_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || 'super-secret-key-best-hcm-2026-auth-jwt-token'
);

const COOKIE_NAME = 'besthcm_session';
const IMPERSONATE_COOKIE_NAME = 'besthcm_impersonate';

export interface ImpersonatePayload {
  adminId: string;
  adminName: string;
  target: UserPayload;
}

export async function createSessionToken(payload: UserPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
}

export async function verifySessionToken(token: string): Promise<UserPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
      id: payload.id as string,
      name: payload.name as string,
      email: payload.email as string,
      role: payload.role as Role,
    };
  } catch (error) {
    return null;
  }
}

/** Sesi admin asli dari cookie utama, tanpa memperhatikan impersonasi. */
export async function getAdminSession(): Promise<UserPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** true bila request saat ini sedang dalam mode "login as user". */
export async function getImpersonation(): Promise<ImpersonatePayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(IMPERSONATE_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload.data as unknown as ImpersonatePayload;
  } catch {
    return null;
  }
}

/**
 * Sesi efektif: bila admin sedang impersonate, kembalikan data user target.
 * Dipakai oleh semua API/halaman yang sebelumnya memanggil getSession().
 */
export async function getSession(): Promise<UserPayload | null> {
  const impersonation = await getImpersonation();
  if (impersonation) return impersonation.target;
  return getAdminSession();
}

export async function createImpersonateToken(data: ImpersonatePayload): Promise<string> {
  return new SignJWT({ data: data as unknown as Record<string, unknown> })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(JWT_SECRET);
}

export async function setImpersonateCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATE_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 2 * 60 * 60, // 2 jam
  });
}

export async function clearImpersonateCookie() {
  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATE_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
