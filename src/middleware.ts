import { NextResponse, NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || 'super-secret-key-best-hcm-2026-auth-jwt-token'
);

const COOKIE_NAME = 'besthcm_session';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(COOKIE_NAME)?.value;

  let user: { id: string; name: string; email: string; role: string } | null = null;

  if (token) {
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      user = {
        id: payload.id as string,
        name: payload.name as string,
        email: payload.email as string,
        role: payload.role as string,
      };
    } catch {
      user = null;
    }
  }

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
