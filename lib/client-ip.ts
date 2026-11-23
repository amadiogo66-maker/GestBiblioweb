import { isIP } from 'node:net';

/** En-tête lu hors Vercel quand CLIENT_IP_HEADER n'est pas défini. */
export const DEFAULT_CLIENT_IP_HEADER = 'x-forwarded-for';

const HEADER_NAME = /^[a-z0-9-]+$/;

/**
 * Adresse IP du client, pour la limitation de tentatives et la journalisation.
 *
 * Sur Vercel (variable VERCEL définie) : `x-vercel-forwarded-for`, puis
 * `x-real-ip`, puis `x-forwarded-for`, premier élément. D'après
 * https://vercel.com/docs/headers/request-headers, Vercel réécrit ces en-têtes
 * pour empêcher l'usurpation.
 *
 * Hors Vercel (serveur de l'université derrière Caddy) : l'en-tête nommé par
 * CLIENT_IP_HEADER (défaut `x-forwarded-for`), et sa DERNIÈRE valeur. La
 * dernière valeur est celle écrite par le proxy le plus proche de
 * l'application, la seule qui ne vient pas du client :
 * - Caddy configuré avec `header_up X-Forwarded-For {remote_host}` écrase
 *   l'en-tête reçu : il n'y a qu'une valeur, l'adresse vue par Caddy ;
 * - si un proxy ajoute au lieu d'écraser, les valeurs du client sont à gauche
 *   et l'adresse observée par ce proxy est à droite.
 * Un client qui envoie son propre en-tête ne change donc pas l'adresse retenue.
 *
 * Absence d'adresse (en-tête manquant, vide, mal formé, ou nom d'en-tête
 * invalide) : null. La limitation regroupe alors ces requêtes dans un seul
 * compteur commun (`unknown`) : elle reste active au lieu d'être contournée.
 */
export function getClientIp(headers: Headers): string | null {
  if (process.env.VERCEL) {
    return vercelClientIp(headers);
  }

  const name = clientIpHeaderName();
  const value = name ? headers.get(name) : null;
  const last = value?.split(',').map((part) => part.trim()).filter(Boolean).at(-1);

  return last && isIP(last) ? last : null;
}

/** Nom d'en-tête configuré, en minuscules ; null s'il est invalide. */
export function clientIpHeaderName(): string | null {
  const configured = process.env.CLIENT_IP_HEADER?.trim().toLowerCase();
  const name = configured || DEFAULT_CLIENT_IP_HEADER;

  return HEADER_NAME.test(name) ? name : null;
}

function vercelClientIp(headers: Headers): string | null {
  for (const value of [headers.get('x-vercel-forwarded-for'), headers.get('x-real-ip'), headers.get('x-forwarded-for')]) {
    const first = value?.split(',')[0]?.trim();

    if (first) {
      return first;
    }
  }

  return null;
}
