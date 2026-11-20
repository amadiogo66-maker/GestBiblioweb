/**
 * Charge UNIQUEMENT la structure officielle de l'Université de Labé
 * (facultés, départements, programmes, alias). Ne touche ni aux utilisateurs,
 * ni aux livres, ni aux membres, ni aux mots de passe : c'est le script à
 * utiliser sur la base distante (le seed complet réécrit le mot de passe de test@test.com).
 *
 *   npm run db:seed-structure            → simulation, aucune écriture
 *   npm run db:seed-structure -- --yes   → écriture (idempotente)
 */
import { prisma } from '../lib/prisma';
import { STRUCTURE_TRANSACTION_OPTIONS, loadUlStructure } from '../prisma/data/load-ul-structure';
import { UL_DEPARTMENT_ALIASES, UL_STRUCTURE_COUNTS } from '../prisma/data/ul-structure';
import { describeDatabaseTarget, hasFlag } from './db-target';

async function currentCounts(): Promise<Record<string, number>> {
  const [faculties, departments, programs, aliases] = await Promise.all([
    prisma.faculty.count(),
    prisma.department.count(),
    prisma.program.count(),
    prisma.departmentAlias.count(),
  ]);

  return { faculties, departments, programs, aliases };
}

async function main(): Promise<void> {
  console.log(`Base visée : ${describeDatabaseTarget()}`);

  const expected = { ...UL_STRUCTURE_COUNTS, aliases: UL_DEPARTMENT_ALIASES.length };
  console.log('Attendu   :', expected);
  console.log('En base   :', await currentCounts());

  if (!hasFlag(process.argv.slice(2), '--yes')) {
    console.log('Simulation : aucune écriture. Ajoutez --yes pour charger la structure.');
    return;
  }

  const written = await prisma.$transaction((tx) => loadUlStructure(tx), STRUCTURE_TRANSACTION_OPTIONS);
  console.log('Upserts   :', written);
  console.log('En base   :', await currentCounts());
}

main()
  .catch((error: unknown) => {
    console.error(`Échec : ${error instanceof Error ? error.message : 'erreur inconnue'}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
