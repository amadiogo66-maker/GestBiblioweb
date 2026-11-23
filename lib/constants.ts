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
  // Par membre du personnel (identifiant haché), toutes actions de modération confondues.
  staffModeration: { limit: 30, windowMs: 15 * MINUTE_MS },
  // Double authentification : seuls les ÉCHECS sont comptés.
  mfaFailuresUser: { limit: 5, windowMs: 15 * MINUTE_MS },
  mfaFailuresIp: { limit: 20, windowMs: 15 * MINUTE_MS },
  // Espace enseignant : écritures sur les listes de lectures (par enseignant).
  teacherReadingListWrite: { limit: 120, windowMs: 15 * MINUTE_MS },
  // Nouvelles propositions d'acquisition (par enseignant).
  acquisitionCreate: { limit: 10, windowMs: 60 * MINUTE_MS },
  // Décisions sur les propositions et modération des listes (par membre du personnel).
  staffAcquisitionDecision: { limit: 60, windowMs: 15 * MINUTE_MS },
} as const satisfies Record<string, RateLimitRule>;

/** Au-delà de ce délai sans contact, le logiciel de gestion est considéré injoignable. */
export const CIRCULATION_STALE_MINUTES = 15;

export const NOTIFICATIONS_PAGE_SIZE = 20;

export const MFA_REQUIRED_CODE = 'mfa_required';
export const CROSS_ORIGIN_MESSAGE = 'Origine de la requête non autorisée';

// Plafonds des corps de requête, comptés en octets réellement lus (lib/json-body.ts).
export const BODY_LIMITS = {
  // Webhooks du logiciel de gestion : /api/*/sync et /api/events/ack.
  sync: 2 * 1024 * 1024,
  // Toutes les autres routes (formulaires, connexion).
  default: 64 * 1024,
} as const;
export const PAYLOAD_TOO_LARGE_MESSAGE = 'Requête trop volumineuse';

// --- Espace du personnel --------------------------------------------------------
export const STAFF_ACCOUNTS_PAGE_SIZE = 20;
export const STAFF_AUDIT_PAGE_SIZE = 30;
export const STAFF_RECENT_ACTIONS = 20;

/** Probabilité, à chaque requête limitée, de purger les compteurs expirés. */
export const RATE_LIMIT_CLEANUP_PROBABILITY = 0.02;
/** Ancienneté au-delà de laquelle un compteur est purgé (≥ la plus longue fenêtre). */
export const RATE_LIMIT_RETENTION_MS = 24 * 60 * MINUTE_MS;

// --- Routes ---------------------------------------------------------------------
/** Page publique affichée à un compte suspendu, banni ou supprimé encore en session. */
export const BLOCKED_ACCOUNT_ROUTE = '/compte-bloque';

// --- Listes de lectures et propositions d'acquisition -----------------------------
export const TEACHER_ONLY_MESSAGE = 'Espace réservé aux enseignants';
export const TEACHER_NO_DEPARTMENT_MESSAGE =
  'Votre compte n’est rattaché à aucun département. Contactez la bibliothèque pour le faire rattacher.';
export const READING_LIST_QUOTAS = { listsPerTeacher: 30, itemsPerList: 100 } as const;
export const ACQUISITION_OPEN_QUOTA = 10;
/** Réponse 409 d'une proposition qui ressemble à un doublon : l'enseignant doit confirmer. */
export const DUPLICATE_WARNING_CODE = 'duplicate_warning';
/** Propositions « ouvertes » : pas encore refusées ni acquises (quota, doublons). */
export const OPEN_ACQUISITION_STATUSES = ['SUBMITTED', 'DEPT_APPROVED', 'LIBRARY_ACCEPTED'] as const;
export const READING_LISTS_PAGE_SIZE = 20;
export const ACQUISITIONS_PAGE_SIZE = 20;

/**
 * Affichage du nom de l'enseignant sur les listes publiées, lues par les membres.
 * Désactivé par défaut : activer seulement avec l'accord des enseignants
 * (variable READING_LISTS_SHOW_TEACHER_NAME=true, voir .env.example).
 */
export function showReadingListTeacherName(): boolean {
  return process.env.READING_LISTS_SHOW_TEACHER_NAME === 'true';
}
