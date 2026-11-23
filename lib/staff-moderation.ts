import type { AccountStatusValue, ModerationAction, StaffRoleValue } from '@/lib/staff-labels';
import { isLibraryStaff } from '@/lib/department-access';

/**
 * Règles de modération des comptes, en fonction pure (testable sans base).
 * Appelée par l'API (décision faisant foi) et par la page de détail (affichage
 * des actions disponibles) : une seule source de vérité.
 */

export interface ModerationActor {
  id: string;
  /** Affectations ACTIVES relues en base, jamais depuis le JWT. */
  roles: readonly StaffRoleValue[];
}

export interface ModerationTarget {
  id: string;
  status: AccountStatusValue;
  hasActiveStaffRole: boolean;
  member: { inscriptionActive: boolean; dateExpiration: Date | null } | null;
}

export type ModerationDecision =
  | { allowed: true; nextStatus: AccountStatusValue }
  | { allowed: false; httpStatus: 403 | 409; message: string };

/** L'inscription à la bibliothèque est-elle en règle (active et non expirée) ? */
export function isMemberRegistrationValid(member: ModerationTarget['member'], now = new Date()): boolean {
  if (!member) {
    return true;
  }

  return member.inscriptionActive && (!member.dateExpiration || member.dateExpiration > now);
}

function deny(httpStatus: 403 | 409, message: string): ModerationDecision {
  return { allowed: false, httpStatus, message };
}

export function evaluateModeration(
  actor: ModerationActor,
  target: ModerationTarget,
  action: ModerationAction,
  now = new Date()
): ModerationDecision {
  const isAdmin = actor.roles.includes('ADMIN');

  // Un responsable de département n'est pas modérateur des comptes.
  if (!isLibraryStaff(actor.roles)) {
    return deny(403, 'Accès refusé.');
  }
  if (target.id === actor.id) {
    return deny(403, 'Vous ne pouvez pas modérer votre propre compte.');
  }
  if (target.hasActiveStaffRole) {
    return deny(403, "Ce compte a un rôle du personnel actif : révoquez d'abord ce rôle (script d'administration).");
  }
  if (target.status === 'PENDING') {
    return deny(409, 'Les comptes en attente de validation ne se modèrent pas ici.');
  }

  switch (action) {
    case 'suspend':
      if (target.status === 'SUSPENDED' || target.status === 'BANNED') {
        return deny(409, 'Ce compte est déjà suspendu ou banni.');
      }
      return { allowed: true, nextStatus: 'SUSPENDED' };

    case 'ban':
      if (!isAdmin) {
        return deny(403, 'Seul un administrateur peut bannir un compte.');
      }
      if (target.status === 'BANNED') {
        return deny(409, 'Ce compte est déjà banni.');
      }
      return { allowed: true, nextStatus: 'BANNED' };

    case 'reactivate':
      if (target.status === 'ACTIVE') {
        return deny(409, 'Ce compte est déjà actif.');
      }
      if (target.status === 'BANNED' && !isAdmin) {
        return deny(403, 'Seul un administrateur peut réactiver un compte banni.');
      }
      if (!isMemberRegistrationValid(target.member, now)) {
        return deny(
          409,
          "L'inscription à la bibliothèque est inactive ou expirée : la prochaine synchronisation suspendrait à nouveau ce compte. Régularisez d'abord l'inscription dans le logiciel de la bibliothèque."
        );
      }
      return { allowed: true, nextStatus: 'ACTIVE' };
  }
}
