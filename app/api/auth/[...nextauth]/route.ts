import type { NextRequest } from 'next/server';
import { handlers } from '@/lib/auth';
import { checkRateLimits, ipRateLimitKey, rateLimitKey, rateLimitedResponse } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';
import { clearedMfaProofCookieHeader } from '@/lib/staff-mfa-session';
import { withoutInactiveSession } from '@/lib/session-response';

/**
 * Seul le point /session est filtré : un compte non actif ou supprimé reçoit
 * la réponse d'une session anonyme. Le CSRF, les fournisseurs et les autres
 * points GET restent ceux d'Auth.js.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const response = await handlers.GET(request);

  return request.nextUrl.pathname.endsWith('/session') ? withoutInactiveSession(response) : response;
}

/**
 * Limite les tentatives de connexion (par IP et par identifiant haché) AVANT
 * qu'Auth.js n'exécute authorize(). En cas de dépassement : 429 + Retry-After.
 * Le champ `url` est requis par next-auth/react signIn() pour exposer
 * `error`/`code` au formulaire (code=rate_limited).
 */
export async function POST(request: NextRequest): Promise<Response> {
  if (request.nextUrl.pathname.endsWith('/callback/credentials')) {
    const identifier = await readIdentifier(request);
    const retryAfter = await checkRateLimits([
      { key: ipRateLimitKey('login', request.headers), rule: RATE_LIMITS.loginIp },
      { key: rateLimitKey('login:identifier', identifier), rule: RATE_LIMITS.loginIdentifier },
    ]);

    if (retryAfter !== null) {
      const url = new URL('/connexion', request.nextUrl.origin);
      url.searchParams.set('error', 'CredentialsSignin');
      url.searchParams.set('code', 'rate_limited');

      return rateLimitedResponse(retryAfter, { url: url.toString() });
    }
  }

  const response = await handlers.POST(request);

  // Déconnexion : la preuve de double authentification du personnel est effacée.
  if (request.nextUrl.pathname.endsWith('/signout')) {
    const headers = new Headers(response.headers);
    headers.append('Set-Cookie', clearedMfaProofCookieHeader());

    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }

  return response;
}

async function readIdentifier(request: NextRequest): Promise<string> {
  try {
    const form = await request.clone().formData();
    const value = form.get('username');

    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}
