import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get('token')?.value;

  const isPublicRoute =
    pathname === '/login' ||
    pathname === '/signup';

  const isStaticOrApi =
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.includes('.');

  if (isStaticOrApi) {
    return NextResponse.next();
  }

  // If user is trying to access protected route without token -> redirect to /login
  if (!token && !isPublicRoute) {
    const loginUrl = new URL('/login', req.url);
    return NextResponse.redirect(loginUrl);
  }

  // If user is logged in and trying to access /login or /signup -> redirect to dashboard /
  if (token && isPublicRoute) {
    const dashboardUrl = new URL('/', req.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for static files and _next internal assets.
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
