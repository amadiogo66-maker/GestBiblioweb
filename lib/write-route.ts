import type { NextResponse } from 'next/server';
import { jsonResponse } from '@/lib/api';
import type { StaffRole } from '@prisma/client';
import { rejectCrossOrigin, requireDepartmentManager, requireStaff, requireTeacher } from '@/lib/authz';
import { enforceRateLimits, rateLimitKey } from '@/lib/rate-limit';
import { RATE_LIMITS, TEACHER_NO_DEPARTMENT_MESSAGE, type RateLimitRule } from '@/lib/constants';
import type { DepartmentActor } from '@/lib/department-access';
import type { PublicUser } from '@/lib/user-select';
import type { ApiResponse } from '@/types';

type Refused = { ok: false; response: NextResponse<ApiResponse<never>> };

/**
 * Préambule des routes d'écriture de l'espace enseignant, dans cet ordre :
 * Origin (anti-CSRF) → compte actif et rôle TEACHER relus en base →
 * limitation de débit par enseignant. Le corps est lu ENSUITE par la route.
 */
export async function beginTeacherWrite(
  request: Request,
  scope: string,
  rule: RateLimitRule = RATE_LIMITS.teacherReadingListWrite
): Promise<{ ok: true; user: PublicUser } | Refused> {
  const crossOrigin = rejectCrossOrigin(request);

  if (crossOrigin) {
    return { ok: false, response: crossOrigin };
  }

  const teacher = await requireTeacher();

  if (!teacher.ok) {
    return teacher;
  }

  const limited = await enforceRateLimits([{ key: rateLimitKey(scope, teacher.user.id), rule }]);

  return limited ? { ok: false, response: limited } : teacher;
}

/** Département de l'enseignant, relu en base avec son compte. Sans département : 403 explicite. */
export function teacherDepartment(user: PublicUser): { ok: true; departmentId: string } | Refused {
  return user.departmentId
    ? { ok: true, departmentId: user.departmentId }
    : { ok: false, response: jsonResponse({ success: false, message: TEACHER_NO_DEPARTMENT_MESSAGE }, 403) };
}

/**
 * Préambule des décisions du personnel sur les départements (propositions,
 * modération des listes) : Origin → personnel actif, MFA vérifiée, affectations
 * relues en base → limitation par membre du personnel.
 */
export async function beginStaffDepartmentWrite(
  request: Request
): Promise<{ ok: true; user: PublicUser; actor: DepartmentActor } | Refused> {
  const crossOrigin = rejectCrossOrigin(request);

  if (crossOrigin) {
    return { ok: false, response: crossOrigin };
  }

  const staff = await requireDepartmentManager();

  if (!staff.ok) {
    return staff;
  }

  const limited = await enforceRateLimits([
    { key: rateLimitKey('staff-acquisition', staff.user.id), rule: RATE_LIMITS.staffAcquisitionDecision },
  ]);

  return limited ? { ok: false, response: limited } : { ok: true, user: staff.user, actor: staff.actor };
}

/**
 * Préambule des écritures d'actualités du site : Origin → personnel de la
 * bibliothèque (ADMIN ou LIBRARIAN) actif, MFA vérifiée, affectations relues
 * en base → limitation du personnel existante (seuil de modération).
 */
export async function beginStaffNewsWrite(
  request: Request
): Promise<{ ok: true; user: PublicUser; staffRoles: StaffRole[] } | Refused> {
  const crossOrigin = rejectCrossOrigin(request);

  if (crossOrigin) {
    return { ok: false, response: crossOrigin };
  }

  const staff = await requireStaff('ADMIN', 'LIBRARIAN');

  if (!staff.ok) {
    return staff;
  }

  const limited = await enforceRateLimits([{ key: rateLimitKey('staff-news', staff.user.id), rule: RATE_LIMITS.staffModeration }]);

  return limited ? { ok: false, response: limited } : { ok: true, user: staff.user, staffRoles: staff.staffRoles };
}

export const notFoundResponse =(message: string): NextResponse<ApiResponse<never>> => jsonResponse({ success: false, message }, 404);
export const conflictResponse = (message: string): NextResponse<ApiResponse<never>> => jsonResponse({ success: false, message }, 409);
