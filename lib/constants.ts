export const APP_NAME = 'Gest Biblio';
export const UNIVERSITY_NAME = 'Université de Labé';
export const CONTACT_ADDRESS = `Campus de ${UNIVERSITY_NAME}, Labé, Guinée`;
export const CONTACT_PHONE = '+224 000 00 00 00';
export const CONTACT_EMAIL = 'bibliotheque@universite-labe.edu.gn';
export const MAX_LOANS_STUDENT = 5;
export const MAX_LOANS_TEACHER = 10;
export const LOAN_DURATION_DAYS = 14;
export const RENEWAL_MAX_COUNT = 2;
export const RENEWAL_DURATION_DAYS = 7;
export const RESERVATION_EXPIRY_DAYS = 3;
export const FINE_PER_DAY = 500;
export const API_VERSION = 'v1';
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

// --- Autorisation -------------------------------------------------------------
export const UNAUTHENTICATED_MESSAGE = 'Non authentifié';
export const FORBIDDEN_MESSAGE = 'Accès refusé';

// --- Limitation de tentatives -------------------------------------------------
// Message unique pour tout dépassement : il ne révèle jamais si un compte,
// un email ou un matricule existe.
export const RATE_LIMIT_MESSAGE = 'Trop de tentatives. Veuillez patienter quelques minutes avant de réessayer.';

export interface RateLimitRule {
  /** Nombre maximal de requêtes autorisées dans la fenêtre. */
  limit: number;
  /** Durée de la fenêtre fixe, en millisecondes. */
  windowMs: number;
}

const MINUTE_MS = 60 * 1000;

// Seuils PAR IP volontairement élevés : de nombreux étudiants partagent la même
// IP publique (Wi-Fi du campus, réseaux mobiles derrière un NAT d'opérateur) ;
// des seuils bas bloqueraient des étudiants légitimes. La protection contre le
// forçage repose surtout sur les seuils par identifiant/matricule/email, plus stricts.
export const RATE_LIMITS = {
  loginIp: { limit: 100, windowMs: 15 * MINUTE_MS },
  loginIdentifier: { limit: 10, windowMs: 15 * MINUTE_MS },
  verifyMemberIp: { limit: 100, windowMs: 15 * MINUTE_MS },
  verifyMemberMatricule: { limit: 5, windowMs: 15 * MINUTE_MS },
  registerIp: { limit: 200, windowMs: 60 * MINUTE_MS },
  forgotPasswordIp: { limit: 60, windowMs: 15 * MINUTE_MS },
  forgotPasswordEmail: { limit: 5, windowMs: 60 * MINUTE_MS },
  resetPasswordIp: { limit: 60, windowMs: 15 * MINUTE_MS },
  contactIp: { limit: 30, windowMs: 60 * MINUTE_MS },
} as const satisfies Record<string, RateLimitRule>;

/** Probabilité, à chaque requête limitée, de purger les compteurs expirés. */
export const RATE_LIMIT_CLEANUP_PROBABILITY = 0.02;
/** Ancienneté au-delà de laquelle un compteur est purgé (≥ la plus longue fenêtre). */
export const RATE_LIMIT_RETENTION_MS = 24 * 60 * MINUTE_MS;

// --- Routes ---------------------------------------------------------------------
/** Page publique affichée à un compte suspendu, banni ou supprimé encore en session. */
export const BLOCKED_ACCOUNT_ROUTE = '/compte-bloque';
