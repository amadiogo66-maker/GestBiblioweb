/**
 * Rattache Book, LibraryMember et User à un département officiel (colonne
 * departmentId) à partir de leur colonne texte, sans jamais rien deviner.
 *
 *   npm run db:backfill-departments                    → DRY-RUN, aucune écriture
 *   npm run db:backfill-departments -- --apply --yes   → écriture (idempotente)
 */
import { prisma } from '../lib/prisma';
import { runDepartmentBackfill, type TableBackfillReport } from '../prisma/data/backfill-departments';
import { describeDatabaseTarget, hasFlag } from './db-target';

function printReport(report: TableBackfillReport, apply: boolean): void {
  console.log(`\n== ${report.table} (colonne texte « ${report.textColumn} ») — ${report.total} ligne(s)`);
  console.log(`   déjà rattachés (non modifiés) : ${report.alreadyLinked}`);
  console.log(`   ${apply ? 'rattachés maintenant' : 'rattachables       '}           : ${apply ? report.written : report.linkable}`);
  console.log(`   non résolus                   : ${report.unresolved}`);
  console.log(`   sans valeur                   : ${report.empty}`);

  for (const { value, count } of report.unresolvedValues) {
    console.log(`     - « ${value} » × ${count}`);
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const apply = hasFlag(argv, '--apply') && hasFlag(argv, '--yes');

  console.log(`Base visée : ${describeDatabaseTarget()}`);
  console.log(apply ? 'Mode : APPLICATION (écriture de departmentId uniquement)' : 'Mode : DRY-RUN (aucune écriture)');

  if (hasFlag(argv, '--apply') && !apply) {
    console.log('--apply sans --yes : exécution en dry-run.');
  }

  const reports = await runDepartmentBackfill(prisma, { apply });

  for (const report of reports) {
    printReport(report, apply);
  }

  if (!apply) {
    console.log('\nAucune écriture. Pour appliquer : npm run db:backfill-departments -- --apply --yes');
  }
}

main()
  .catch((error: unknown) => {
    console.error(`Échec : ${error instanceof Error ? error.message : 'erreur inconnue'}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
