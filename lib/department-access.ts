import { LIBRARY_STAFF_ROLES, type StaffRoleValue } from '@/lib/staff-labels';

/**
 * Périmètre départemental d'un membre du personnel, calculé à partir de ses
 * affectations ACTIVES relues en base (jamais d'un paramètre, d'un corps de
 * requête ni du JWT). Fonctions pures : utilisables par les pages et l'API.
 */

export interface ScopedAssignment {
  role: StaffRoleValue;
  departmentId: string | null;
}

export interface DepartmentActor {
  userId: string;
  /** ADMIN ou LIBRARIAN : tous les départements. */
  allDepartments: boolean;
  /** Départements des affectations DEPARTMENT_MANAGER actives (sans doublon). */
  departmentIds: readonly string[];
  roles: readonly StaffRoleValue[];
}

export function isLibraryStaff(roles: readonly StaffRoleValue[]): boolean {
  return roles.some((role) => (LIBRARY_STAFF_ROLES as readonly StaffRoleValue[]).includes(role));
}

export function departmentActorFrom(userId: string, assignments: readonly ScopedAssignment[]): DepartmentActor {
  const roles = [...new Set(assignments.map((assignment) => assignment.role))];
  const departmentIds = [
    ...new Set(
      assignments
        .filter((assignment) => assignment.role === 'DEPARTMENT_MANAGER' && assignment.departmentId)
        .map((assignment) => assignment.departmentId as string)
    ),
  ];

  return { userId, allDepartments: isLibraryStaff(roles), departmentIds, roles };
}

/**
 * Point de passage UNIQUE pour tout accès à un département : listes, propositions,
 * statistiques, décisions. Un identifiant inconnu ou d'un autre département donne false.
 */
export function canAccessDepartment(actor: DepartmentActor, departmentId: string | null | undefined): boolean {
  if (!departmentId) {
    return false;
  }

  return actor.allDepartments || actor.departmentIds.includes(departmentId);
}

/** Décision à la place du responsable : un ADMIN ou LIBRARIAN qui n'est pas responsable de ce département. */
export function isSubstituteDecision(actor: DepartmentActor, departmentId: string): boolean {
  return actor.allDepartments && !actor.departmentIds.includes(departmentId);
}
