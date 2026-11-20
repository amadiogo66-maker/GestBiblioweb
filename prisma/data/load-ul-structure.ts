import type { Prisma, PrismaClient } from '@prisma/client';
import { UL_DEPARTMENT_ALIASES, UL_STRUCTURE } from './ul-structure';

type StructureClient = PrismaClient | Prisma.TransactionClient;

export interface StructureCounts {
  faculties: number;
  departments: number;
  programs: number;
  aliases: number;
}

/**
 * Charge la structure officielle (facultés, départements, programmes, alias)
 * par upsert sur les slugs figés : idempotent, rejouable sans effet.
 * Ne touche à AUCUNE autre table (utilisateurs, livres, membres, mots de passe).
 * Ne supprime rien : une entrée retirée du fichier reste en base (décision manuelle).
 */
export async function loadUlStructure(db: StructureClient): Promise<StructureCounts> {
  const departmentIdBySlug = new Map<string, string>();
  const counts: StructureCounts = { faculties: 0, departments: 0, programs: 0, aliases: 0 };

  for (const [facultyIndex, faculty] of UL_STRUCTURE.entries()) {
    const facultyData = { name: faculty.name, sortOrder: facultyIndex + 1 };
    const { id: facultyId } = await db.faculty.upsert({
      where: { slug: faculty.slug },
      create: { slug: faculty.slug, ...facultyData },
      update: facultyData,
      select: { id: true },
    });
    counts.faculties += 1;

    for (const [departmentIndex, department] of faculty.departments.entries()) {
      const departmentData = { name: department.name, facultyId, sortOrder: departmentIndex + 1 };
      const { id: departmentId } = await db.department.upsert({
        where: { slug: department.slug },
        create: { slug: department.slug, ...departmentData },
        update: departmentData,
        select: { id: true },
      });
      departmentIdBySlug.set(department.slug, departmentId);
      counts.departments += 1;

      for (const [programIndex, program] of department.programs.entries()) {
        const programData = { name: program.name, level: program.level, sortOrder: programIndex + 1 };
        await db.program.upsert({
          where: { departmentId_slug: { departmentId, slug: program.slug } },
          create: { departmentId, slug: program.slug, ...programData },
          update: programData,
        });
        counts.programs += 1;
      }
    }
  }

  for (const alias of UL_DEPARTMENT_ALIASES) {
    const departmentId = departmentIdBySlug.get(alias.departmentSlug);

    if (!departmentId) {
      throw new Error(`Alias « ${alias.normalized} » : département inconnu ${alias.departmentSlug}`);
    }

    await db.departmentAlias.upsert({
      where: { normalized: alias.normalized },
      create: { normalized: alias.normalized, departmentId, note: alias.note },
      update: { departmentId, note: alias.note },
    });
    counts.aliases += 1;
  }

  return counts;
}

/** Délai large : depuis un poste local vers une base distante, ~90 allers-retours. */
export const STRUCTURE_TRANSACTION_OPTIONS = { timeout: 120_000, maxWait: 20_000 } as const;
