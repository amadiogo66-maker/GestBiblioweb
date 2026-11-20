/**
 * Libellés de l'espace du personnel. Littéraux uniquement (aucun import de
 * valeur depuis @prisma/client) : utilisable dans les composants client.
 */

export type AccountStatusValue = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'BANNED';
export type UserRoleValue = 'STUDENT' | 'TEACHER' | 'VISITOR';
export type StaffRoleValue = 'ADMIN' | 'LIBRARIAN';
export type ModerationAction = 'suspend' | 'ban' | 'reactivate';

export const ACCOUNT_STATUS_LABELS: Record<AccountStatusValue, string> = {
  PENDING: 'En attente',
  ACTIVE: 'Actif',
  SUSPENDED: 'Suspendu',
  BANNED: 'Banni',
};

export const ACCOUNT_STATUS_BADGE: Record<AccountStatusValue, 'success' | 'danger' | 'neutral' | 'new'> = {
  PENDING: 'new',
  ACTIVE: 'success',
  SUSPENDED: 'neutral',
  BANNED: 'danger',
};

export const USER_ROLE_LABELS: Record<UserRoleValue, string> = {
  STUDENT: 'Étudiant',
  TEACHER: 'Enseignant',
  VISITOR: 'Visiteur',
};

export const STAFF_ROLE_LABELS: Record<StaffRoleValue, string> = {
  ADMIN: 'Administrateur',
  LIBRARIAN: 'Bibliothécaire',
};

export const MODERATION_ACTION_LABELS: Record<ModerationAction, string> = {
  suspend: 'Suspendre',
  ban: 'Bannir',
  reactivate: 'Réactiver',
};

export const ACCOUNT_STATUSES = Object.keys(ACCOUNT_STATUS_LABELS) as AccountStatusValue[];
export const USER_ROLES = Object.keys(USER_ROLE_LABELS) as UserRoleValue[];
