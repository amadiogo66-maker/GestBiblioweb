import type { NextResponse } from 'next/server';
import type { StaffRole, User } from '@prisma/client';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { jsonResponse } from '@/lib/api';
import { FORBIDDEN_MESSAGE, UNAUTHENTICATED_MESSAGE } from '@/lib/constants';
import type { ApiResponse } from '@/types';

type Denied = { ok: false; response: NextResponse<ApiResponse<never>> };

export type ActiveUserResult = { ok: true; user: User } | Denied;
export type StaffResult = { ok: true; user: User; staffRoles: StaffRole[] } | Denied;

function deny(status: 401 | 403, message: string): Denied {
  return { ok: false, response: jsonResponse({ success: false, message }, status) };
}

/**
 * Utilisateur de la session, relu en base, autorisé seulement s'il est ACTIVE.
 * Le JWT ne sert qu'à connaître l'identifiant : un statut changé en base
 * (suspension, bannissement) s'applique immédiatement.
 */
export async function requireActiveUser(): Promise<ActiveUserResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return deny(401, UNAUTHENTICATED_MESSAGE);
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });

  if (!user || user.status !== 'ACTIVE') {
    return deny(401, UNAUTHENTICATED_MESSAGE);
  }

  return { ok: true, user };
}

/**
 * Membre du personnel actif ayant au moins un des rôles demandés (ou n'importe
 * quel rôle si aucun n'est précisé). Les affectations sont toujours relues en
 * base, jamais dans le JWT ; les affectations révoquées sont ignorées.
 */
export async function requireStaff(...roles: StaffRole[]): Promise<StaffResult> {
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
    select: { role: true },
  });

  if (assignments.length === 0) {
    return deny(403, FORBIDDEN_MESSAGE);
  }

  return { ok: true, user: active.user, staffRoles: assignments.map((assignment) => assignment.role) };
}
