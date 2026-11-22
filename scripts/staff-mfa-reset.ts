/**
 * Réinitialise la double authentification d'un membre du personnel (appareil
 * perdu, secret compromis) : invalide les preuves existantes, supprime le secret
 * et les codes de secours, crée un nouveau code d'activation.
 *
 *   npm run staff:mfa-reset -- <email>         → simulation
 *   npm run staff:mfa-reset -- <email> --yes   → application
 */
import { prisma } from '../lib/prisma';
import { buildActivityLogData } from '../lib/activity-log';
import { issueActivationCode, resetStaffMfa } from '../lib/staff-mfa-store';
import { describeDatabaseTarget, hasFlag, printActivationCode } from './db-target';

function fail(message: string): never {
  console.error(`Erreur : ${message}`);
  console.error('Usage : npm run staff:mfa-reset -- <email> [--yes]');
  process.exit(1);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const email = argv.find((arg) => arg !== '--yes')?.trim().toLowerCase();

  if (!email || !email.includes('@')) fail('email manquant ou invalide');

  console.log(`Base visée : ${describeDatabaseTarget()}`);

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, staffAssignments: { where: { revokedAt: null }, select: { id: true }, take: 1 } },
  });

  if (!user) fail(`aucun compte avec l'email ${email}`);
  if (user.staffAssignments.length === 0) fail("ce compte n'a aucune affectation du personnel active");

  if (!hasFlag(argv, '--yes')) {
    console.log(`Simulation : réinitialiser la double authentification de ${email}. Ajoutez --yes pour appliquer.`);
    return;
  }

  const code = await prisma.$transaction(async (tx) => {
    await resetStaffMfa(tx, user.id);
    const activationCode = await issueActivationCode(tx, user.id);
    await tx.activityLog.create({ data: buildActivityLogData({ action: 'auth.mfa.reset', userId: user.id, details: { source: 'cli' } }) });
    return activationCode;
  });

  console.log(`Fait : double authentification réinitialisée — ${email}.`);
  printActivationCode(code);
}

main()
  .catch((error: unknown) => {
    console.error(`Échec : ${error instanceof Error ? error.message : 'erreur inconnue'}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
