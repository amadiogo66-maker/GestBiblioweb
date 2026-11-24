import { ACCOUNT_STATUS_LABELS, STAFF_ROLE_LABELS, type AccountStatusValue, type StaffRoleValue } from '@/lib/staff-labels';

/**
 * Présentation de l'ActivityLog dans l'espace du personnel. Le champ `details`
 * n'est JAMAIS affiché brut : seules les clés de cette liste sont rendues, avec
 * des valeurs simples. Tout le reste (hachages, emails du formulaire de
 * contact, etc.) est ignoré.
 */
const DETAIL_LABELS: Record<string, string> = {
  statusBefore: 'Statut avant',
  statusAfter: 'Statut après',
  reason: 'Motif',
  role: 'Rôle',
  source: 'Origine',
  status: 'Statut',
  created: 'Créés',
  updated: 'Mis à jour',
  rejected: 'Rejetés',
  suspended: 'Suspendus',
  reactivated: 'Réactivés',
  roleUpdated: 'Rôles modifiés',
  unresolvedDepartments: 'Départements non reconnus',
  userDepartmentsUpdated: 'Départements de comptes alignés',
  externalId: 'Référence livre',
  method: 'Méthode',
  stage: 'Étape',
  from: 'Étape avant',
  to: 'Étape après',
  substitute: 'Décision à la place du responsable',
  note: 'Note',
  notified: 'Étudiants prévenus',
  notNotified: 'Étudiants non prévenus (plafond atteint)',
};

const ACTION_LABELS: Record<string, string> = {
  'staff.account.suspend': 'Suspension de compte',
  'staff.account.ban': 'Bannissement de compte',
  'staff.account.reactivate': 'Réactivation de compte',
  'staff.grant': 'Attribution de rôle du personnel',
  'staff.revoke': 'Révocation de rôle du personnel',
  'auth.login.success': 'Connexion réussie',
  'auth.login.failed': 'Connexion échouée',
  'auth.login.blocked': 'Connexion refusée (compte bloqué)',
  'auth.register': 'Inscription',
  'members.sync': 'Synchronisation des membres',
  'auth.mfa.enrolled': 'Double authentification activée',
  'auth.mfa.verify.success': 'Double authentification réussie',
  'auth.mfa.verify.failed': 'Double authentification échouée',
  'auth.mfa.recovery_used': 'Code de secours utilisé',
  'auth.mfa.recovery_regenerated': 'Codes de secours régénérés',
  'auth.mfa.reset': 'Double authentification réinitialisée',
  'reading_list.create': 'Liste de lectures créée',
  'reading_list.update': 'Liste de lectures modifiée',
  'reading_list.publish': 'Liste de lectures publiée',
  'reading_list.unpublish': 'Liste de lectures dépubliée',
  'reading_list.delete': 'Liste de lectures supprimée',
  'reading_list.item_add': 'Ouvrage ajouté à une liste',
  'reading_list.item_update': 'Ouvrage d’une liste modifié',
  'reading_list.item_remove': 'Ouvrage retiré d’une liste',
  'reading_list.moderation_unpublish': 'Liste dépubliée par la bibliothèque',
  'acquisition.submit': 'Proposition d’acquisition déposée',
  'acquisition.withdraw': 'Proposition d’acquisition retirée',
  'acquisition.dept_approved': 'Proposition validée par le département',
  'acquisition.dept_rejected': 'Proposition refusée par le département',
  'acquisition.library_accepted': 'Proposition acceptée par la bibliothèque',
  'acquisition.library_rejected': 'Proposition refusée par la bibliothèque',
  'acquisition.acquired': 'Ouvrage acquis',
};

const CLI_ACTIONS = new Set(['staff.grant', 'staff.revoke']);

export interface AuditEntryLike {
  action: string;
  userId: string | null;
  details: unknown;
}

export function auditActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function asRecord(details: unknown): Record<string, unknown> {
  return details && typeof details === 'object' && !Array.isArray(details) ? (details as Record<string, unknown>) : {};
}

function displayValue(key: string, value: unknown): string | null {
  if (typeof value === 'boolean') return value ? 'oui' : 'non';
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return null;
  if ((key === 'statusBefore' || key === 'statusAfter' || key === 'status') && value in ACCOUNT_STATUS_LABELS) {
    return ACCOUNT_STATUS_LABELS[value as AccountStatusValue];
  }
  if (key === 'role' && value in STAFF_ROLE_LABELS) return STAFF_ROLE_LABELS[value as StaffRoleValue];
  if (key === 'source' && value === 'cli') return "Script d'administration";
  return value.length > 500 ? `${value.slice(0, 500)}…` : value;
}

/** Résumé lisible : uniquement les clés autorisées, valeurs simples. */
export function summarizeAuditDetails(details: unknown): Array<{ label: string; value: string }> {
  const record = asRecord(details);

  return Object.keys(DETAIL_LABELS).flatMap((key) => {
    const value = displayValue(key, record[key]);
    return value === null ? [] : [{ label: DETAIL_LABELS[key], value }];
  });
}

/**
 * Acteur d'une entrée : pour les scripts d'administration, userId désigne la
 * CIBLE (aucun acteur connecté) ; ailleurs, userId est l'acteur.
 */
export function auditActorId(entry: AuditEntryLike): string | null {
  return CLI_ACTIONS.has(entry.action) ? null : entry.userId;
}

export function auditTargetId(entry: AuditEntryLike): string | null {
  if (CLI_ACTIONS.has(entry.action)) return entry.userId;
  const target = asRecord(entry.details).targetUserId;
  return typeof target === 'string' ? target : null;
}

export function isCliAction(action: string): boolean {
  return CLI_ACTIONS.has(action);
}

/** Date et heure à l'heure de Conakry (UTC+0), stable quel que soit le serveur. */
export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Africa/Conakry',
  }).format(date);
}
