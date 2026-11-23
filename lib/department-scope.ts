import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { canAccessDepartment, type DepartmentActor } from '@/lib/department-access';

export interface ScopedDepartment {
  id: string;
  slug: string;
  name: string;
}

const select = { id: true, slug: true, name: true } as const;

/** Départements accessibles à l'acteur (tous pour ADMIN / LIBRARIAN, les siens pour un responsable). */
export async function accessibleDepartments(actor: DepartmentActor): Promise<ScopedDepartment[]> {
  return prisma.department.findMany({
    where: actor.allDepartments ? {} : { id: { in: [...actor.departmentIds] } },
    select,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

/**
 * Département demandé par l'URL (?departement=<slug>), contrôlé par
 * canAccessDepartment : un département d'un autre responsable donne notFound(),
 * exactement comme un département inexistant. Sans paramètre : le seul
 * département accessible, sinon aucun (la page propose le choix).
 */
export async function resolveScopedDepartment(
  actor: DepartmentActor,
  slug: string | undefined
): Promise<{ selected: ScopedDepartment | null; options: ScopedDepartment[] }> {
  const options = await accessibleDepartments(actor);

  if (slug) {
    const department = await prisma.department.findUnique({ where: { slug }, select });

    if (!department || !canAccessDepartment(actor, department.id)) {
      notFound();
    }

    return { selected: department, options };
  }

  const only = options.length === 1 ? options[0] : null;

  return { selected: only && canAccessDepartment(actor, only.id) ? only : null, options };
}
