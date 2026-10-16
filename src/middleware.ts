import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Allow public static assets, favicon, Next.js internal files, images
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname === '/favicon.ico' ||
    pathname === '/login-bg-clean.png' ||
    pathname === '/roynix-loud-avatar.png' ||
    pathname === '/roynix-loud-banner.png' ||
    pathname.includes('.') // Any static extension (e.g. .png, .jpg, .svg, .css, .js)
  ) {
    return NextResponse.next();
  }

  // 2. Allow public auth and health endpoints
  if (
    pathname === '/login' ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/health') ||
    pathname.startsWith('/api/ready') ||
    pathname.startsWith('/api/supabase')
  ) {
    return NextResponse.next();
  }

  // 3. Check for loud_session cookie
  const sessionCookie = request.cookies.get('loud_session')?.value;

  if (!sessionCookie) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // 4. Validate session JWT format (header.payload.signature)
  const parts = sessionCookie.split('.');
  if (parts.length !== 3) {
    const loginUrl = new URL('/login', request.url);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete('loud_session');
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
