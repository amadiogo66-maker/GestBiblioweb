import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { BLOCKED_ACCOUNT_ROUTE, UNAUTHENTICATED_MESSAGE } from '@/lib/constants';

// '/personnel' : session requise ici ; l'autorisation (affectation du personnel)
// est décidée par le layout de l'espace en relisant la base, jamais par le JWT.
const protectedRoutes = ['/tableau-de-bord', '/emprunts', '/reservations', '/profil', '/carte-bibliotheque', '/notifications', '/personnel'];
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

  if (pathname === '/api/books/sync' || pathname === '/api/news/sync' || pathname === '/api/members/sync' || pathname === '/api/notifications/sync' || pathname === '/api/loans/sync' || pathname === '/api/reservations/sync' || pathname === '/api/events' || pathname === '/api/events/ack' || pathname === '/api/contact' || pathname === '/api/stats') {
    return NextResponse.next();
  }

  const session = await auth();
  const isProtectedRoute = protectedRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  const isApiRoute = pathname.startsWith('/api') && !pathname.startsWith('/api/health') && !pathname.startsWith('/api/auth');
  const isAuthPage = authPages.includes(pathname);

  if (isApiRoute && !session?.user) {
    return NextResponse.json({ success: false, message: UNAUTHENTICATED_MESSAGE }, { status: 401 });
  }

  if (isProtectedRoute && !session?.user) {
    const redirectUrl = new URL('/connexion', request.url);
    redirectUrl.searchParams.set('callbackUrl', request.url);
    return NextResponse.redirect(redirectUrl);
  }

  if (session?.user && isAuthPage) {
    return NextResponse.redirect(new URL('/tableau-de-bord', request.url));
  }

  // /compte-bloque reste accessible même si le JWT (périmé) indique encore PENDING,
  // sinon un compte en attente puis suspendu bouclerait entre les deux pages.
  if (
    session?.user?.status === 'PENDING' &&
    pathname !== pendingRoute &&
    pathname !== BLOCKED_ACCOUNT_ROUTE &&
    !pathname.startsWith('/api/auth')
  ) {
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
