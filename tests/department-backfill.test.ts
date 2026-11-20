import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from './helpers/local-db';
import { runDepartmentBackfill } from '@/prisma/data/backfill-departments';
import { STRUCTURE_TRANSACTION_OPTIONS, loadUlStructure } from '@/prisma/data/load-ul-structure';

const suffix = randomUUID().slice(0, 8);
const TABLES = ['Book', 'LibraryMember', 'User'] as const;

interface LinkState {
  id: string;
  departmentId: string | null;
}

async function linkState(table: (typeof TABLES)[number]): Promise<LinkState[]> {
  return prisma.$queryRawUnsafe<LinkState[]>(`SELECT "id", "departmentId" FROM "${table}" ORDER BY "id"`);
}

async function allLinkStates() {
  return Object.fromEntries(await Promise.all(TABLES.map(async (t) => [t, await linkState(t)] as const)));
}

describe('backfill des départements (base locale)', () => {
  const bookText: Record<string, string> = {
    math: 'Département de Mathématiques',
    info: '  INFORMATIQUE ',
    alias: 'Maths',
    unknown: `Médecine ${suffix}`,
    preset: 'Informatique',
  };
  const bookIds: Record<string, string> = {};
  let memberId = '';
  let userId = '';
  let departmentIdBySlug = new Map<string, string>();
  /** Lignes préexistantes sans departmentId : remises à NULL en fin de test. */
  let initiallyUnlinked: Record<string, string[]> = {};

  beforeAll(async () => {
    await prisma.$transaction((tx) => loadUlStructure(tx), STRUCTURE_TRANSACTION_OPTIONS);
    departmentIdBySlug = new Map((await prisma.department.findMany()).map((d) => [d.slug, d.id]));

    const states = await allLinkStates();
    initiallyUnlinked = Object.fromEntries(
      TABLES.map((t) => [t, states[t].filter((row) => row.departmentId === null).map((row) => row.id)])
    );

    for (const [key, department] of Object.entries(bookText)) {
      const book = await prisma.book.create({
        data: {
          externalId: `TEST-BACKFILL-${key}-${suffix}`,
          isbn: `TEST-${key}-${suffix}`,
          title: `Livre test ${key}`,
          author: 'Test',
          category: 'Test',
          department,
          ...(key === 'preset' ? { departmentId: departmentIdBySlug.get('biologie') } : {}),
        },
      });
      bookIds[key] = book.id;
    }
    memberId = (
      await prisma.libraryMember.create({
        data: { matricule: `TEST-BF-${suffix}`, nom: 'Test', prenom: 'Backfill', dateNaissance: new Date('2000-01-01'), departement: 'Chimie' },
      })
    ).id;
    userId = (
      await prisma.user.create({
        data: {
          email: `backfill-${suffix}@test.local`,
          username: `backfill_${suffix}`,
          password: 'x',
          firstName: 'Back',
          lastName: 'Fill',
          department: 'Sciences du langage',
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.book.deleteMany({ where: { id: { in: Object.values(bookIds) } } });
    await prisma.libraryMember.deleteMany({ where: { id: memberId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    // Remise en état : les lignes préexistantes redeviennent non rattachées.
    for (const table of TABLES) {
      const ids = initiallyUnlinked[table] ?? [];
      if (ids.length > 0) {
        await prisma.$executeRawUnsafe(`UPDATE "${table}" SET "departmentId" = NULL WHERE "id" = ANY($1::text[])`, ids);
      }
    }
  });

  it('dry-run : rapporte sans rien écrire', async () => {
    const before = await allLinkStates();
    const reports = await runDepartmentBackfill(prisma, { apply: false });
    const books = reports.find((r) => r.table === 'Book')!;

    expect(await allLinkStates()).toEqual(before);
    expect(reports.every((r) => r.written === 0)).toBe(true);
    expect(books.unresolvedValues).toContainEqual({ value: bookText.unknown, count: 1 });
    expect(books.alreadyLinked).toBeGreaterThanOrEqual(1);
  });

  it('apply : rattache, ne devine rien, n’écrase rien, ne touche ni texte ni dates', async () => {
    const fixtureBefore = await prisma.book.findMany({ where: { id: { in: Object.values(bookIds) } }, orderBy: { id: 'asc' } });
    const memberBefore = await prisma.libraryMember.findUniqueOrThrow({ where: { id: memberId } });
    const userBefore = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    await runDepartmentBackfill(prisma, { apply: true });

    const linked = async (id: string) => (await prisma.book.findUniqueOrThrow({ where: { id } })).departmentId;
    expect(await linked(bookIds.math)).toBe(departmentIdBySlug.get('mathematiques'));
    expect(await linked(bookIds.info)).toBe(departmentIdBySlug.get('informatique'));
    expect(await linked(bookIds.alias)).toBe(departmentIdBySlug.get('mathematiques'));
    expect(await linked(bookIds.unknown)).toBeNull();
    expect(await linked(bookIds.preset)).toBe(departmentIdBySlug.get('biologie'));

    const member = await prisma.libraryMember.findUniqueOrThrow({ where: { id: memberId } });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(member.departmentId).toBe(departmentIdBySlug.get('physique-chimie'));
    expect(user.departmentId).toBe(departmentIdBySlug.get('sciences-du-langage'));

    // Texte, programmes et horodatages (@updatedAt, syncedAt) inchangés.
    const fixtureAfter = await prisma.book.findMany({ where: { id: { in: Object.values(bookIds) } }, orderBy: { id: 'asc' } });
    expect(fixtureAfter.map(({ departmentId: _d, ...rest }) => rest)).toEqual(
      fixtureBefore.map(({ departmentId: _d, ...rest }) => rest)
    );
    expect({ ...member, departmentId: null }).toEqual({ ...memberBefore, departmentId: null });
    expect(member.programId).toBeNull();
    expect({ ...user, departmentId: null }).toEqual({ ...userBefore, departmentId: null });
  });

  it('apply rejoué : aucune écriture, état identique', async () => {
    const before = await allLinkStates();
    const reports = await runDepartmentBackfill(prisma, { apply: true });

    expect(reports.map((r) => r.written)).toEqual([0, 0, 0]);
    expect(reports.every((r) => r.linkable === 0)).toBe(true);
    expect(await allLinkStates()).toEqual(before);
  });
});
