/**
 * Contrôle anti-CSRF des mutations sensibles : l'en-tête Origin (posé par le
 * navigateur, non modifiable par un script d'un autre site) doit désigner le
 * même hôte que la requête. Hôte attendu : x-forwarded-host (posé par le proxy
 * Vercel) sinon Host. Origin absent ou illisible : refusé.
 */
export function isSameOriginRequest(headers: Headers): boolean {
  const origin = headers.get('origin');
  const host = (headers.get('x-forwarded-host') ?? headers.get('host'))?.split(',')[0]?.trim().toLowerCase();

  if (!origin || !host) {
    return false;
  }

  try {
    return new URL(origin).host.toLowerCase() === host;
  } catch {
    return false;
  }
}
