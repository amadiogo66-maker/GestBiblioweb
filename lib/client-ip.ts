/**
 * Adresse IP du client, pour la limitation de tentatives et la journalisation.
 *
 * Sur Vercel (variable VERCEL définie), on lit d'abord `x-vercel-forwarded-for`.
 * D'après https://vercel.com/docs/headers/request-headers, cet en-tête est
 * identique à `x-forwarded-for`, que Vercel réécrit pour empêcher l'usurpation,
 * mais il reste correct même si un autre proxy est placé devant Vercel.
 * Repli : `x-real-ip` (également documenté comme identique), puis `x-forwarded-for`.
 *
 * Hors Vercel (développement local), ces en-têtes sont fournis par le client
 * et ne sont PAS fiables : ils ne servent qu'à faire fonctionner le code localement.
 */
export function getClientIp(headers: Headers): string | null {
  const candidates = process.env.VERCEL
    ? [headers.get('x-vercel-forwarded-for'), headers.get('x-real-ip'), headers.get('x-forwarded-for')]
    : [headers.get('x-forwarded-for'), headers.get('x-real-ip')];

  for (const value of candidates) {
    const first = value?.split(',')[0]?.trim();

    if (first) {
      return first;
    }
  }

  return null;
}
