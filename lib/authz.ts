import type { NextResponse } from 'next/server';
import type { StaffRole } from '@prisma/client';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { jsonResponse } from '@/lib/api';
import { isSameOriginRequest } from '@/lib/origin';
import { publicUserSelect, type PublicUser } from '@/lib/user-select';
import { getStaffMfaState } from '@/lib/staff-mfa-session';
import { departmentActorFrom, type DepartmentActor, type ScopedAssignment } from '@/lib/department-access';
import { CROSS_ORIGIN_MESSAGE, FORBIDDEN_MESSAGE, MFA_REQUIRED_CODE, TEACHER_ONLY_MESSAGE, UNAUTHENTICATED_MESSAGE } from '@/lib/constants';
import type { ApiResponse } from '@/types';

type Denied = { ok: false; response: NextResponse<ApiResponse<never>> };

export type ActiveUserResult = { ok: true; user: PublicUser } | Denied;
export type StaffResult = { ok: true; user: PublicUser; staffRoles: StaffRole[]; assignments: ScopedAssignment[] } | Denied;
export type DepartmentManagerResult = { ok: true; user: PublicUser; staffRoles: StaffRole[]; actor: DepartmentActor } | Denied;
export type TeacherResult = { ok: true; user: PublicUser } | Denied;

function deny(status: 401 | 403, message: string, code?: string): Denied {
  return { ok: false, response: jsonResponse({ success: false, message, ...(code ? { code } : {}) }, status) };
}

/**
 * Anti-CSRF des mutations qui dépendent de la session : Origin doit désigner
 * le même hôte (Host ou X-Forwarded-Host du reverse proxy). Sinon 403 JSON.
 */
export function rejectCrossOrigin(request: Request): NextResponse<ApiResponse<never>> | null {
  return isSameOriginRequest(request.headers) ? null : jsonResponse({ success: false, message: CROSS_ORIGIN_MESSAGE }, 403);
}

/**
 * Utilisateur de la session, relu en base, autorisé seulement s'il est ACTIVE.
 * Le JWT ne sert qu'à connaître l'identifiant : un statut changé en base
 * (suspension, bannissement) s'applique immédiatement. Champs explicites :
 * jamais le mot de passe ni le QR code.
 */
export async function requireActiveUser(): Promise<ActiveUserResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return deny(401, UNAUTHENTICATED_MESSAGE);
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: publicUserSelect });

  if (!user || user.status !== 'ACTIVE') {
    return deny(401, UNAUTHENTICATED_MESSAGE);
  }

  return { ok: true, user };
}

/**
 * Membre du personnel actif ayant au moins un des rôles demandés (ou n'importe
 * quel rôle), SANS contrôle de double authentification. Réservé aux routes qui
 * mettent en place ou vérifient la double authentification elle-même.
 */
export async function requireStaffIdentity(...roles: StaffRole[]): Promise<StaffResult> {
  const active = await requireActiveUser();

  if (!active.ok) {
    return active;
  }

  const assignments = await prisma.staffAssignment.findMany({
    where: {
      userId: active.user.id,
      revokedAt: null,
      ...(roles.length > 0 ? { role: { in: roles } } : {}),
    },
    select: { role: true, departmentId: true },
  });

  if (assignments.length === 0) {
    return deny(403, FORBIDDEN_MESSAGE);
  }

  return { ok: true, user: active.user, staffRoles: [...new Set(assignments.map((assignment) => assignment.role))], assignments };
}

/**
 * Membre du personnel actif (rôles relus en base, affectations révoquées
 * ignorées) ET double authentification vérifiée : StaffMfa activée en base et
 * cookie de preuve valide pour cet utilisateur et cette époque. Sinon 403
 * { code: 'mfa_required' }.
 */
export async function requireStaff(...roles: StaffRole[]): Promise<StaffResult> {
  const staff = await requireStaffIdentity(...roles);

  if (!staff.ok) {
    return staff;
  }

  if ((await getStaffMfaState(staff.user.id)) !== 'verified') {
    return deny(403, 'Double authentification requise', MFA_REQUIRED_CODE);
  }

  return staff;
}

/**
 * Personnel pouvant agir sur des départements : responsable (ses départements,
 * relus en base dans ses affectations actives), ADMIN ou LIBRARIAN (tous).
 * Double authentification exigée comme pour tout le personnel. Toute décision
 * sur un département passe ENSUITE par canAccessDepartment(actor, id).
 */
export async function requireDepartmentManager(): Promise<DepartmentManagerResult> {
  const staff = await requireStaff('DEPARTMENT_MANAGER', 'ADMIN', 'LIBRARIAN');

  if (!staff.ok) {
    return staff;
  }

  return { ok: true, user: staff.user, staffRoles: staff.staffRoles, actor: departmentActorFrom(staff.user.id, staff.assignments) };
}

/** Enseignant actif : rôle TEACHER relu en base (jamais depuis le JWT). Sinon 403. */
export async function requireTeacher(): Promise<TeacherResult> {
  const active = await requireActiveUser();

  if (!active.ok) {
    return active;
  }

  if (active.user.role !== 'TEACHER') {
    return deny(403, TEACHER_ONLY_MESSAGE);
  }

  return active;
}
