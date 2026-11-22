/**
 * Rappels d'emprunts : retards et échéances à 3 jours ou moins. Idempotent, à
 * planifier une fois par jour. N'écrit jamais Loan.status.
 *
 *   npm run notifications:generate            → simulation
 *   npm run notifications:generate -- --yes   → création des rappels
 */
import { prisma } from '../lib/prisma';
import { generateLoanReminders } from '../lib/notification-reminders';
import { describeDatabaseTarget, hasFlag } from './db-target';

async function main(): Promise<void> {
  const apply = hasFlag(process.argv.slice(2), '--yes');

  console.log(`Base visée : ${describeDatabaseTarget()}`);

  const report = await generateLoanReminders(prisma, { apply });

  console.log(`Prêts en retard : ${report.overdue}`);
  console.log(`Échéances proches : ${report.dueSoon}`);
  console.log(`Rappels déjà envoyés : ${report.alreadySent}`);

  if (apply) {
    console.log(`Fait : ${report.created} rappel(s) créé(s).`);
  } else {
    console.log(`Simulation : ${report.overdue + report.dueSoon - report.alreadySent} rappel(s) seraient créés. Ajoutez --yes pour appliquer.`);
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
