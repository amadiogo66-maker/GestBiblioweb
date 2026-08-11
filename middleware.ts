import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

const protectedRoutes = ['/tableau-de-bord', '/emprunts', '/reservations', '/profil', '/carte-bibliotheque'];
const authPages = ['/connexion', '/inscription', '/mot-de-passe-oublie', '/reinitialiser-mot-de-passe'];
const pendingRoute = '/en-attente-validation';

export const runtime = 'nodejs';

export const config = {
  matcher: ['/((?!_next|api/health|favicon.ico|public).*)'],
};

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/_next') || pathname.startsWith('/api/health') || pathname.startsWith('/api/auth') || pathname === '/favicon.ico' || pathname.startsWith('/public')) {
    return NextResponse.next();
  }

  if (request.method === 'GET' && pathname.startsWith('/api/books')) {
    return NextResponse.next();
  }

  if (pathname === '/api/books/sync') {
    return NextResponse.next();
  }

  const session = await auth();
  const isProtectedRoute = protectedRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  const isApiRoute = pathname.startsWith('/api') && !pathname.startsWith('/api/health') && !pathname.startsWith('/api/auth');
  const isAuthPage = authPages.includes(pathname);

  if ((isProtectedRoute || isApiRoute) && !session?.user) {
    const redirectUrl = new URL('/connexion', request.url);
    redirectUrl.searchParams.set('callbackUrl', request.url);
    return NextResponse.redirect(redirectUrl);
  }

  if (session?.user && isAuthPage) {
    return NextResponse.redirect(new URL('/tableau-de-bord', request.url));
  }

  if (session?.user?.status === 'PENDING' && pathname !== pendingRoute && !pathname.startsWith('/api/auth')) {
    return NextResponse.redirect(new URL(pendingRoute, request.url));
  }

  const response = NextResponse.next();
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self';"
  );

  return response;
}
