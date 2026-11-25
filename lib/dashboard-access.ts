import { cache } from 'react';
import { redirect } from 'next/navigation';
import type { UserRole } from '@prisma/client';
import { auth } from '@/lib/auth';
import { BLOCKED_ACCOUNT_ROUTE } from '@/lib/constants';
import { prisma } from '@/lib/prisma';

export interface DashboardUser {
  id: string;
  firstName: string;
  /** Une affectation du personnel active existe (relu en base, jamais depuis le JWT). */
  hasStaffAccess: boolean;
  /** Rôle et département officiel, relus en base (jamais depuis le JWT). */
  role: UserRole;
  departmentId: string | null;
}

/**
 * Statut du compte de la session, relu en base UNE fois par requête : le layout
 * et la page partagent cette lecture. Aucune donnée personnelle superflue.
 */
const loadSessionAccount = cache(async () => {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const account = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      status: true,
      role: true,
      departmentId: true,
      staffAssignments: { where: { revokedAt: null }, select: { id: true }, take: 1 },
    },
  });

  return {
    id: session.user.id,
    firstName: session.user.firstName,
    status: account?.status ?? null,
    hasStaffAccess: (account?.staffAssignments.length ?? 0) > 0,
    role: account?.role ?? 'STUDENT',
    departmentId: account?.departmentId ?? null,
  };
});

/**
 * Garde de l'espace personnel : à appeler en PREMIÈRE instruction de chaque page,
 * et à attendre avant toute lecture de données. Le layout et la page s'exécutent
 * en parallèle : la redirection du layout seule n'empêche pas le contenu de la
 * page de partir dans la réponse.
 */
export async function requireActiveDashboardUser(): Promise<DashboardUser> {
  const account = await loadSessionAccount();

  if (!account) {
    redirect('/connexion');
  }

  if (account.status !== 'ACTIVE') {
    // Compte bloqué ou supprimé : page publique dédiée (rediriger vers /connexion
    // bouclerait, le middleware y renvoyant tout utilisateur en session).
    redirect(account.status === 'PENDING' ? '/en-attente-validation' : BLOCKED_ACCOUNT_ROUTE);
  }

  return {
    id: account.id,
    firstName: account.firstName,
    hasStaffAccess: account.hasStaffAccess,
    role: account.role,
    departmentId: account.departmentId,
  };
}

/**
 * Pour une page PUBLIQUE qui personnalise son affichage : identifiant du compte
 * s'il est actif, sinon null (la page reste accessible, sans donnée personnelle).
 */
export async function getActiveSessionUserId(): Promise<string | null> {
  return (await getActiveSessionViewer())?.id ?? null;
}

/** Comme getActiveSessionUserId, avec le rôle relu en base (même lecture mise en cache, aucune requête de plus). */
export async function getActiveSessionViewer(): Promise<{ id: string; role: UserRole } | null> {
  const account = await loadSessionAccount();

  return account?.status === 'ACTIVE' ? { id: account.id, role: account.role } : null;
}
