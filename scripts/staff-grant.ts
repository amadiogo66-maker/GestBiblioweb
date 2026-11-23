/**
 * Attribue ou révoque un rôle du personnel (StaffAssignment).
 *
 *   npm run staff:grant  -- <email> <ADMIN|LIBRARIAN> [--yes]
 *   npm run staff:grant  -- <email> DEPARTMENT_MANAGER --department <slug> [--yes]
 *   npm run staff:revoke -- <email> <ADMIN|LIBRARIAN> [--yes]
 *   npm run staff:revoke -- <email> DEPARTMENT_MANAGER --department <slug> [--yes]
 *
 * --department est obligatoire pour DEPARTMENT_MANAGER et refusé pour les autres
 * rôles (la base l'impose aussi par une contrainte CHECK). Un responsable peut
 * gérer plusieurs départements : une affectation par département.
 * Sans --yes : affiche la base visée et ce qui serait fait, sans rien modifier.
 * La base visée est celle de DATABASE_URL (variable de session, sinon .env).
 */
import { StaffRole } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logActivity } from '../lib/activity-log';
import { issueActivationCode, removeStaffMfa } from '../lib/staff-mfa-store';
import { describeDatabaseTarget, printActivationCode } from './db-target';

type Action = 'grant' | 'revoke';

interface Args {
  action: Action;
  email: string;
  role: StaffRole;
  departmentSlug: string | null;
  confirmed: boolean;
}

function usage(message: string): never {
  console.error(`Erreur : ${message}`);
  console.error('Usage : npm run staff:grant -- <email> <ADMIN|LIBRARIAN> [--yes]');
  console.error('        npm run staff:grant -- <email> DEPARTMENT_MANAGER --department <slug> [--yes]');
  console.error('        npm run staff:revoke -- <email> <rôle> [--department <slug>] [--yes]');
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const confirmed = argv.includes('--yes');
  const departmentIndex = argv.indexOf('--department');
  const departmentSlug = departmentIndex === -1 ? null : argv[departmentIndex + 1]?.trim().toLowerCase() ?? '';
  const positional = argv.filter((arg, index) => arg !== '--yes' && arg !== '--department' && (departmentIndex === -1 || index !== departmentIndex + 1));
  const [action, email, role] = positional;

  if (action !== 'grant' && action !== 'revoke') usage('action attendue : grant ou revoke');
  if (!email || !email.includes('@')) usage('email manquant ou invalide');
  if (!role || !(role.toUpperCase() in StaffRole)) usage(`rôle attendu : ${Object.keys(StaffRole).join(', ')}`);

  const staffRole = role.toUpperCase() as StaffRole;

  if (departmentSlug === '' || departmentSlug?.startsWith('--')) usage('--department attend le slug du département (ex. informatique)');
  if (staffRole === 'DEPARTMENT_MANAGER' && !departmentSlug) usage('--department <slug> est obligatoire pour DEPARTMENT_MANAGER');
  if (staffRole !== 'DEPARTMENT_MANAGER' && departmentSlug) usage(`--department n'est accepté que pour DEPARTMENT_MANAGER (pas pour ${staffRole})`);

  return { action, email: email.trim().toLowerCase(), role: staffRole, departmentSlug, confirmed };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // Prisma a chargé .env à l'import (sans écraser une variable de session) ;
  // l'hôte est affiché avant toute connexion.
  console.log(`Base visée : ${describeDatabaseTarget()}`);

  const user = await prisma.user.findUnique({
    where: { email: args.email },
    select: { id: true, status: true },
  });

  if (!user) usage(`aucun compte avec l'email ${args.email}`);

  const department = args.departmentSlug
    ? await prisma.department.findUnique({ where: { slug: args.departmentSlug }, select: { id: true, name: true } })
    : null;

  if (args.departmentSlug && !department) usage(`département inconnu : ${args.departmentSlug} (voir la table Department, colonne slug)`);

  const label = department ? `${args.role} (${department.name})` : args.role;
  // Une ligne par (utilisateur, rôle, département) : unicité garantie par des index partiels.
  const existing = await prisma.staffAssignment.findFirst({
    where: { userId: user.id, role: args.role, departmentId: department?.id ?? null },
    select: { id: true, revokedAt: true },
  });
  const isActiveAssignment = Boolean(existing && !existing.revokedAt);

  if (args.action === 'grant') {
    if (user.status !== 'ACTIVE') usage(`le compte est ${user.status} : seul un compte ACTIVE peut recevoir un rôle`);
    if (isActiveAssignment) {
      console.log(`Rien à faire : ${args.email} a déjà le rôle ${label}.`);
      // Rôle déjà présent sans MFA active : permet de remplacer un code d'activation expiré.
      await issueCodeIfNeeded(user.id, args.confirmed);
      return;
    }
  } else if (!isActiveAssignment) {
    console.log(`Rien à faire : ${args.email} n'a pas le rôle ${label} (ou il est déjà révoqué).`);
    return;
  }

  const verb = args.action === 'grant' ? 'Attribuer' : 'Révoquer';

  if (!args.confirmed) {
    console.log(`Simulation : ${verb} ${label} à ${args.email}. Ajoutez --yes pour appliquer.`);
    return;
  }

  let mfaRemoved = false;

  if (args.action === 'grant') {
    // Ré-attribution après révocation : on réactive la ligne existante.
    if (existing) {
      await prisma.staffAssignment.update({ where: { id: existing.id }, data: { revokedAt: null } });
    } else {
      await prisma.staffAssignment.create({ data: { userId: user.id, role: args.role, departmentId: department?.id ?? null } });
    }
  } else {
    // Dernière affectation active révoquée : secret, codes de secours et code d'activation disparaissent.
    mfaRemoved = await prisma.$transaction(async (tx) => {
      await tx.staffAssignment.update({ where: { id: existing!.id }, data: { revokedAt: new Date() } });
      const remaining = await tx.staffAssignment.count({ where: { userId: user.id, revokedAt: null } });

      if (remaining > 0) {
        return false;
      }

      await removeStaffMfa(tx, user.id);
      return true;
    });
  }

  await logActivity({
    action: args.action === 'grant' ? 'staff.grant' : 'staff.revoke',
    userId: user.id,
    details: {
      role: args.role,
      source: 'cli',
      ...(department ? { departmentId: department.id } : {}),
      ...(mfaRemoved ? { mfaRemoved: true } : {}),
    },
  });

  console.log(`Fait : ${verb.toLowerCase()} ${label} — ${args.email}.`);

  if (mfaRemoved) {
    console.log('Dernière affectation révoquée : double authentification supprimée.');
  } else if (args.action === 'revoke') {
    console.log('Une autre affectation reste active : la double authentification est conservée.');
  }

  if (args.action === 'grant') {
    await issueCodeIfNeeded(user.id, true);
  }
}

/** Compte sans MFA active : crée un code d'activation, affiché UNE seule fois. */
async function issueCodeIfNeeded(userId: string, confirmed: boolean): Promise<void> {
  const mfa = await prisma.staffMfa.findUnique({ where: { userId }, select: { enabledAt: true } });

  if (mfa?.enabledAt) {
    return;
  }

  if (!confirmed) {
    console.log("Simulation : un code d'activation de la double authentification serait créé.");
    return;
  }

  printActivationCode(await issueActivationCode(prisma, userId));
}

main()
  .catch((error: unknown) => {
    console.error(`Échec : ${error instanceof Error ? error.message : 'erreur inconnue'}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
