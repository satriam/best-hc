import { NextResponse, NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || 'super-secret-key-best-hcm-2026-auth-jwt-token'
);

const COOKIE_NAME = 'besthcm_session';
const IMPERSONATE_COOKIE_NAME = 'besthcm_impersonate';

async function readPayload(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Sesi admin asli (selalu dari cookie utama, tidak terpengaruh impersonasi).
  const adminPayload = await readPayload(request.cookies.get(COOKIE_NAME)?.value);
  const adminUser = adminPayload
    ? {
        id: adminPayload.id as string,
        name: adminPayload.name as string,
        email: adminPayload.email as string,
        role: adminPayload.role as string,
      }
    : null;

  // Sesi efektif: bila sedang "login as user", pakai data target.
  const impersonatePayload = await readPayload(request.cookies.get(IMPERSONATE_COOKIE_NAME)?.value);
  const impersonateData = impersonatePayload?.data as
    | { target?: { id: string; name: string; email: string; role: string } }
    | undefined;
  const user = adminUser?.role === 'ADMIN' && impersonateData?.target ? impersonateData.target : adminUser;

  // If visiting login page while logged in
  if (pathname === '/login' || pathname === '/') {
    if (user) {
      if (user.role === 'ADMIN') {
        return NextResponse.redirect(new URL('/admin/dashboard', request.url));
      }
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    if (pathname === '/') {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
  }

  // Protected routes check
  const isAdminRoute = pathname.startsWith('/admin');
  const isUserRoute =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/leave-requests') ||
    pathname.startsWith('/profile');

  if (isAdminRoute || isUserRoute) {
    if (!user) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (isAdminRoute && user.role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/login',
    '/dashboard/:path*',
    '/leave-requests/:path*',
    '/profile/:path*',
    '/admin/:path*',
  ],
};
