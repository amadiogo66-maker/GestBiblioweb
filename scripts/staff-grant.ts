/**
 * Attribue ou révoque un rôle du personnel (StaffAssignment).
 *
 *   npm run staff:grant  -- <email> <ADMIN|LIBRARIAN> [--yes]
 *   npm run staff:revoke -- <email> <ADMIN|LIBRARIAN> [--yes]
 *
 * Sans --yes : affiche la base visée et ce qui serait fait, sans rien modifier.
 * La base visée est celle de DATABASE_URL (variable de session, sinon .env).
 */
import { StaffRole } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logActivity } from '../lib/activity-log';

type Action = 'grant' | 'revoke';

interface Args {
  action: Action;
  email: string;
  role: StaffRole;
  confirmed: boolean;
}

function usage(message: string): never {
  console.error(`Erreur : ${message}`);
  console.error('Usage : npm run staff:grant -- <email> <ADMIN|LIBRARIAN> [--yes]');
  console.error('        npm run staff:revoke -- <email> <ADMIN|LIBRARIAN> [--yes]');
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const confirmed = argv.includes('--yes');
  const [action, email, role] = argv.filter((arg) => arg !== '--yes');

  if (action !== 'grant' && action !== 'revoke') usage('action attendue : grant ou revoke');
  if (!email || !email.includes('@')) usage('email manquant ou invalide');
  if (!role || !(role.toUpperCase() in StaffRole)) usage(`rôle attendu : ${Object.keys(StaffRole).join(' ou ')}`);

  return { action, email: email.trim().toLowerCase(), role: role.toUpperCase() as StaffRole, confirmed };
}

/** Hôte, port et base visés — jamais l'utilisateur ni le mot de passe. */
function describeDatabase(): string {
  const raw = process.env.DATABASE_URL;

  if (!raw) return 'inconnue (DATABASE_URL non définie)';

  try {
    const url = new URL(raw);
    return `${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname}`;
  } catch {
    return 'illisible (DATABASE_URL invalide)';
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // Prisma a chargé .env à l'import (sans écraser une variable de session) ;
  // l'hôte est affiché avant toute connexion.
  console.log(`Base visée : ${describeDatabase()}`);

  const user = await prisma.user.findUnique({
    where: { email: args.email },
    select: { id: true, status: true },
  });

  if (!user) usage(`aucun compte avec l'email ${args.email}`);

  const existing = await prisma.staffAssignment.findUnique({
    where: { userId_role: { userId: user.id, role: args.role } },
    select: { revokedAt: true },
  });
  const isActiveAssignment = Boolean(existing && !existing.revokedAt);

  if (args.action === 'grant') {
    if (user.status !== 'ACTIVE') usage(`le compte est ${user.status} : seul un compte ACTIVE peut recevoir un rôle`);
    if (isActiveAssignment) {
      console.log(`Rien à faire : ${args.email} a déjà le rôle ${args.role}.`);
      return;
    }
  } else if (!isActiveAssignment) {
    console.log(`Rien à faire : ${args.email} n'a pas le rôle ${args.role} (ou il est déjà révoqué).`);
    return;
  }

  const verb = args.action === 'grant' ? 'Attribuer' : 'Révoquer';

  if (!args.confirmed) {
    console.log(`Simulation : ${verb} ${args.role} à ${args.email}. Ajoutez --yes pour appliquer.`);
    return;
  }

  if (args.action === 'grant') {
    // Ré-attribution après révocation : on réactive la ligne existante (unique userId+role).
    await prisma.staffAssignment.upsert({
      where: { userId_role: { userId: user.id, role: args.role } },
      create: { userId: user.id, role: args.role },
      update: { revokedAt: null },
    });
  } else {
    await prisma.staffAssignment.update({
      where: { userId_role: { userId: user.id, role: args.role } },
      data: { revokedAt: new Date() },
    });
  }

  await logActivity({
    action: args.action === 'grant' ? 'staff.grant' : 'staff.revoke',
    userId: user.id,
    details: { role: args.role, source: 'cli' },
  });

  console.log(`Fait : ${verb.toLowerCase()} ${args.role} — ${args.email}.`);
}

main()
  .catch((error: unknown) => {
    console.error(`Échec : ${error instanceof Error ? error.message : 'erreur inconnue'}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
