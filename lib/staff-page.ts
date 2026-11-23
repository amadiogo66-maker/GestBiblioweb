import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import type { StaffRole } from '@prisma/client';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { MFA_ROUTES, computeMfaState, readMfaProofCookie, type StaffMfaState } from '@/lib/staff-mfa-session';
import { departmentActorFrom, isLibraryStaff, type DepartmentActor } from '@/lib/department-access';

export interface StaffPageContext {
  /** Champs strictement nécessaires à l'affichage (jamais password, qrCode…). */
  user: { id: string; firstName: string; lastName: string; email: string };
  staffRoles: StaffRole[];
  isAdmin: boolean;
  /** ADMIN ou LIBRARIAN : comptes, modération, acquisitions, tous les départements. */
  isLibraryStaff: boolean;
  /** Périmètre départemental, relu en base avec les affectations. */
  departmentActor: DepartmentActor;
  mfaState: StaffMfaState;
  mfaEnabledAt: Date | null;
}

/**
 * Contexte du personnel pour les pages serveur, mémoïsé pour la durée d'UNE
 * requête (layouts, page et métadonnées partagent la même lecture).
 *
 * Mêmes règles que requireStaff() — compte ACTIVE relu en base, affectations
 * non révoquées, double authentification — avec une sélection EXPLICITE en une
 * seule requête : le mot de passe n'est jamais chargé, donc jamais sérialisé.
 */
export const loadStaffPageContext = cache(async (): Promise<StaffPageContext | null> => {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const [user, proof] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        status: true,
        staffAssignments: { where: { revokedAt: null }, select: { role: true, departmentId: true } },
        staffMfa: { select: { enabledAt: true, epoch: true } },
      },
    }),
    readMfaProofCookie(),
  ]);

  if (!user || user.status !== 'ACTIVE' || user.staffAssignments.length === 0) {
    return null;
  }

  const staffRoles = [...new Set(user.staffAssignments.map((assignment) => assignment.role))];

  return {
    user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email },
    staffRoles,
    isAdmin: staffRoles.includes('ADMIN'),
    isLibraryStaff: isLibraryStaff(staffRoles),
    departmentActor: departmentActorFrom(user.id, user.staffAssignments),
    mfaState: computeMfaState(user.id, user.staffMfa, proof),
    mfaEnabledAt: user.staffMfa?.enabledAt ?? null,
  };
});

function hasRoles(context: StaffPageContext, roles: StaffRole[]): boolean {
  return roles.length === 0 || roles.some((role) => context.staffRoles.includes(role));
}

/**
 * Identité du personnel SANS exigence de double authentification : réservée au
 * layout de l'espace et aux pages /personnel/securite. Sans affectation : notFound().
 */
export async function requireStaffPageIdentity(...roles: StaffRole[]): Promise<StaffPageContext> {
  const context = await loadStaffPageContext();

  if (!context || !hasRoles(context, roles)) {
    notFound();
  }

  return context;
}

/** Page à vérifier selon l'état : activation (pas encore de MFA) ou vérification. */
export function mfaRedirectTarget(state: StaffMfaState): string {
  return state === 'not_enrolled' ? MFA_ROUTES.activation : MFA_ROUTES.verification;
}

/**
 * Garde des pages protégées de /personnel : personnel actif (sinon notFound(),
 * l'espace n'est pas révélé) ET double authentification vérifiée (sinon
 * redirection vers l'activation ou la vérification).
 */
export async function requireStaffPage(...roles: StaffRole[]): Promise<StaffPageContext> {
  const context = await requireStaffPageIdentity(...roles);

  if (context.mfaState !== 'verified') {
    redirect(mfaRedirectTarget(context.mfaState));
  }

  return context;
}

/**
 * Garde des pages de l'espace département : responsable (ses départements) ou
 * ADMIN / LIBRARIAN (tous), double authentification vérifiée. Chaque page
 * contrôle ENSUITE le département demandé avec canAccessDepartment().
 */
export async function requireDepartmentManagerPage(): Promise<StaffPageContext> {
  return requireStaffPage('DEPARTMENT_MANAGER', 'ADMIN', 'LIBRARIAN');
}
