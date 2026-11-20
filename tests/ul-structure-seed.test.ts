import { describe, expect, it } from 'vitest';
import { prisma } from './helpers/local-db';
import { runTsScript } from './helpers/run-script';
import { STRUCTURE_TRANSACTION_OPTIONS, loadUlStructure } from '@/prisma/data/load-ul-structure';

const EXPECTED = { faculties: 4, departments: 18, programs: 64, aliases: 4 };

async function structureCounts() {
  const [faculties, departments, programs, aliases] = await Promise.all([
    prisma.faculty.count(),
    prisma.department.count(),
    prisma.program.count(),
    prisma.departmentAlias.count(),
  ]);

  return { faculties, departments, programs, aliases };
}

async function structureSnapshot() {
  return {
    faculties: await prisma.faculty.findMany({ orderBy: { slug: 'asc' } }),
    departments: await prisma.department.findMany({ orderBy: { slug: 'asc' } }),
    programs: await prisma.program.findMany({ orderBy: [{ departmentId: 'asc' }, { slug: 'asc' }] }),
    aliases: await prisma.departmentAlias.findMany({ orderBy: { normalized: 'asc' } }),
  };
}

/** Lignes complètes (tous champs, mots de passe hachés compris) des tables à préserver. */
async function protectedTablesSnapshot() {
  const dump = (table: string) =>
    prisma.$queryRawUnsafe<Array<{ row: unknown }>>(`SELECT row_to_json(t) AS row FROM "${table}" t ORDER BY t."id"`);

  return {
    users: await dump('User'),
    books: await dump('Book'),
    members: await dump('LibraryMember'),
    news: await dump('News'),
    settings: await dump('SiteSetting'),
  };
}

async function tableCounts() {
  const [users, books, members, news] = await Promise.all([
    prisma.user.count(),
    prisma.book.count(),
    prisma.libraryMember.count(),
    prisma.news.count(),
  ]);

  return { users, books, members, news };
}

describe('chargement de la structure officielle (base locale)', () => {
  it('loadUlStructure deux fois : mêmes comptes, mêmes lignes (identifiants stables)', async () => {
    await prisma.$transaction((tx) => loadUlStructure(tx), STRUCTURE_TRANSACTION_OPTIONS);
    const first = await structureSnapshot();
    await prisma.$transaction((tx) => loadUlStructure(tx), STRUCTURE_TRANSACTION_OPTIONS);

    expect(await structureCounts()).toEqual(EXPECTED);
    expect(await structureSnapshot()).toEqual(first);
  });

  it('db:seed-structure deux fois : mêmes comptes, aucun utilisateur/mot de passe/livre/membre modifié', async () => {
    const before = await protectedTablesSnapshot();

    const dryRun = runTsScript('scripts/seed-structure.ts');
    expect(dryRun).toContain('Base visée : localhost');
    expect(dryRun).toContain('Simulation');

    runTsScript('scripts/seed-structure.ts', ['--yes']);
    const afterFirst = await structureSnapshot();
    const output = runTsScript('scripts/seed-structure.ts', ['--yes']);

    expect(output).toContain('Base visée : localhost');
    expect(await structureCounts()).toEqual(EXPECTED);
    expect(await structureSnapshot()).toEqual(afterFirst);
    expect(await protectedTablesSnapshot()).toEqual(before);
  }, 120_000);

  it('seed complet deux fois : mêmes comptes (structure et autres tables)', async () => {
    runTsScript('prisma/seed.ts');
    const first = { structure: await structureCounts(), tables: await tableCounts() };
    runTsScript('prisma/seed.ts');

    expect(first.structure).toEqual(EXPECTED);
    expect({ structure: await structureCounts(), tables: await tableCounts() }).toEqual(first);
  }, 120_000);
});
