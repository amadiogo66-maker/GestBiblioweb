import { Prisma, type PrismaClient } from '@prisma/client';
import { loadDepartmentIndex, lookupDepartmentId } from '../../lib/departments';

export type BackfillTable = 'Book' | 'LibraryMember' | 'User';

export interface TableBackfillReport {
  table: BackfillTable;
  /** Colonne texte lue (jamais modifiée). */
  textColumn: 'department' | 'departement';
  total: number;
  /** departmentId déjà renseigné : jamais écrasé. */
  alreadyLinked: number;
  /** Résolus et sans departmentId : rattachés (apply) ou rattachables (dry-run). */
  linkable: number;
  /** Lignes effectivement mises à jour (0 en dry-run). */
  written: number;
  /** Texte renseigné mais non résolu. */
  unresolved: number;
  /** Texte vide ou absent. */
  empty: number;
  /** Valeurs distinctes non résolues → effectif, triées par effectif décroissant. */
  unresolvedValues: Array<{ value: string; count: number }>;
}

interface Row {
  id: string;
  text: string | null;
  departmentId: string | null;
}

const TABLES: Array<{ table: BackfillTable; textColumn: TableBackfillReport['textColumn'] }> = [
  { table: 'Book', textColumn: 'department' },
  { table: 'LibraryMember', textColumn: 'departement' },
  { table: 'User', textColumn: 'department' },
];

/**
 * Rattache les lignes existantes à un département officiel à partir de leur
 * colonne texte. Par défaut AUCUNE écriture (dry-run). Avec apply :
 * - n'écrit que departmentId, uniquement là où il est NULL (jamais d'écrasement) ;
 * - SQL direct pour ne PAS modifier updatedAt / syncedAt (@updatedAt Prisma) ;
 * - ne touche ni aux colonnes texte ni aux programmes ; rejouable sans effet.
 * Ne devine rien : un libellé inconnu de l'index (noms, slugs, alias) reste non résolu.
 */
export async function runDepartmentBackfill(
  db: PrismaClient,
  options: { apply: boolean }
): Promise<TableBackfillReport[]> {
  const index = await loadDepartmentIndex(db);
  const reports: TableBackfillReport[] = [];

  for (const { table, textColumn } of TABLES) {
    const rows = await db.$queryRaw<Row[]>(
      Prisma.sql`SELECT "id", ${Prisma.raw(`"${textColumn}"`)} AS "text", "departmentId" FROM ${Prisma.raw(`"${table}"`)}`
    );
    const report: TableBackfillReport = {
      table,
      textColumn,
      total: rows.length,
      alreadyLinked: 0,
      linkable: 0,
      written: 0,
      unresolved: 0,
      empty: 0,
      unresolvedValues: [],
    };
    const unresolvedCounts = new Map<string, number>();
    const idsByDepartment = new Map<string, string[]>();

    for (const row of rows) {
      if (row.departmentId) {
        report.alreadyLinked += 1;
        continue;
      }

      if (!row.text || !row.text.trim()) {
        report.empty += 1;
        continue;
      }

      const departmentId = lookupDepartmentId(index, row.text);

      if (!departmentId) {
        report.unresolved += 1;
        unresolvedCounts.set(row.text, (unresolvedCounts.get(row.text) ?? 0) + 1);
        continue;
      }

      report.linkable += 1;
      idsByDepartment.set(departmentId, [...(idsByDepartment.get(departmentId) ?? []), row.id]);
    }

    if (options.apply) {
      for (const [departmentId, ids] of idsByDepartment) {
        report.written += await db.$executeRaw(
          Prisma.sql`UPDATE ${Prisma.raw(`"${table}"`)} SET "departmentId" = ${departmentId}
                     WHERE "id" = ANY(${ids}::text[]) AND "departmentId" IS NULL`
        );
      }
    }

    report.unresolvedValues = [...unresolvedCounts]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'fr'));
    reports.push(report);
  }

  return reports;
}
