/**
 * Supprime les événements de la boîte d'envoi DÉJÀ TRAITÉS depuis plus de N jours.
 * Un événement non acquitté n'est jamais supprimé.
 *
 *   npm run events:purge                       → simulation (90 jours)
 *   npm run events:purge -- --days 30 --yes    → suppression
 */
import { prisma } from '../lib/prisma';
import { describeDatabaseTarget, hasFlag } from './db-target';

function parseDays(argv: string[]): number {
  const index = argv.indexOf('--days');

  if (index === -1) return 90;

  const days = Number(argv[index + 1]);

  if (!Number.isInteger(days) || days < 1) {
    console.error('Erreur : --days attend un entier supérieur ou égal à 1.');
    process.exit(1);
  }

  return days;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const days = parseDays(argv);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const where = { processedAt: { lt: cutoff } };

  console.log(`Base visée : ${describeDatabaseTarget()}`);

  if (!hasFlag(argv, '--yes')) {
    console.log(`Simulation : ${await prisma.siteEvent.count({ where })} événement(s) traité(s) depuis plus de ${days} jours seraient supprimés. Ajoutez --yes pour appliquer.`);
    return;
  }

  const { count } = await prisma.siteEvent.deleteMany({ where });
  console.log(`Fait : ${count} événement(s) supprimé(s).`);
}

main()
  .catch((error: unknown) => {
    console.error(`Échec : ${error instanceof Error ? error.message : 'erreur inconnue'}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
