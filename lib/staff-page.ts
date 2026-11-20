import { cache } from 'react';
import { notFound } from 'next/navigation';
import type { StaffRole } from '@prisma/client';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export interface StaffPageContext {
  /** Champs strictement nécessaires à l'affichage (jamais password, qrCode…). */
  user: { id: string; firstName: string; lastName: string; email: string };
  staffRoles: StaffRole[];
  isAdmin: boolean;
}

/**
 * Contexte du personnel pour les pages serveur, mémoïsé pour la durée d'UNE
 * requête (layout, page et métadonnées partagent la même lecture).
 *
 * Mêmes règles que requireStaff() — compte ACTIVE relu en base, affectations
 * non révoquées — mais avec une sélection EXPLICITE en une seule requête : le
 * mot de passe n'est jamais chargé, donc jamais sérialisé (y compris dans les
 * informations de débogage RSC du mode développement).
 */
export const loadStaffPageContext = cache(async (): Promise<StaffPageContext | null> => {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      status: true,
      staffAssignments: { where: { revokedAt: null }, select: { role: true } },
    },
  });

  if (!user || user.status !== 'ACTIVE' || user.staffAssignments.length === 0) {
    return null;
  }

  const staffRoles = user.staffAssignments.map((assignment) => assignment.role);

  return {
    user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email },
    staffRoles,
    isAdmin: staffRoles.includes('ADMIN'),
  };
});

/**
 * Garde des pages /personnel : sans affectation active (ou sans l'un des rôles
 * demandés), notFound() — le contenu de l'espace n'est pas révélé.
 */
export async function requireStaffPage(...roles: StaffRole[]): Promise<StaffPageContext> {
  const context = await loadStaffPageContext();

  if (!context || (roles.length > 0 && !roles.some((role) => context.staffRoles.includes(role)))) {
    notFound();
  }

  return context;
}
