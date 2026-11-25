import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import type { Prisma } from '@prisma/client';
import { countQueries } from './helpers/query-counter';
import { prisma } from './helpers/local-db';
import { cleanupWorld, createWorld, jsonRequest, params, proofFor, sessionFor, type Profile, type World } from './helpers/department-fixtures';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
const jar = vi.hoisted(() => ({ proof: undefined as string | undefined }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => (jar.proof ? { value: jar.proof } : undefined) }) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => '/tableau-de-bord',
}));

const { auth } = await import('@/lib/auth');
const { rateLimitKey } = await import('@/lib/rate-limit');
const { RATE_LIMITS, READING_LIST_NOTIFY } = await import('@/lib/constants');
const { notifyReadingListPublished, readingListDedupeKey } = await import('@/lib/reading-list-notify');
const { PATCH: patchList } = await import('@/app/api/teacher/reading-lists/[id]/route');
const { POST: staffUnpublish } = await import('@/app/api/staff/reading-lists/[id]/unpublish/route');
const { default: Dashboard } = await import('@/app/(dashboard)/tableau-de-bord/page');
const { default: MemberListsPage } = await import('@/app/(dashboard)/listes-de-lecture/page');
const { default: TeacherListPage } = await import('@/app/(dashboard)/enseignant/listes/[id]/page');

const authMock = vi.mocked(auth as unknown as (...args: unknown[]) => Promise<unknown>);
const startedAt = new Date();
let world: World;

/** Comptes propres à ce fichier (supprimés en fin de fichier). */
const extra: Record<'studentA2' | 'suspendedStudentA' | 'studentB' | 'teacherC', string> = {} as never;
let deptC: { id: string; slug: string };
const massIds: string[] = [];
const MASS = READING_LIST_NOTIFY.maxRecipients + 5;

function as(id: string | null): void {
  jar.proof = id ? proofFor(id) : undefined;
  authMock.mockResolvedValue(sessionFor(id));
}
const asProfile = (profile: Profile) => as(world.users[profile].id);
const html = (value: unknown) => renderToStaticMarkup(value as ReactElement);
const read = async (response: Response) => ({ status: response.status, body: await response.json() });
const sp = (value: Record<string, string> = {}) => ({ searchParams: Promise.resolve(value) });
const prefix = (listId: string) => `reading-list:${listId}:published:`;
const notificationsOf = (listId: string) => prisma.notification.findMany({ where: { dedupeKey: { startsWith: prefix(listId) } } });

async function makeUser(key: string, role: 'STUDENT' | 'TEACHER', status: 'ACTIVE' | 'SUSPENDED', departmentId: string | null): Promise<string> {
  const user = await prisma.user.create({
    data: { email: `rln-${key}-${world.suffix}@test.local`, username: `rln_${key}_${world.suffix}`, password: 'x', firstName: `P${key}`, lastName: 'Test', role, status, departmentId },
  });
  return user.id;
}

async function draftOf(ownerId: string, departmentId: string, title: string, status: 'DRAFT' | 'PUBLISHED' = 'DRAFT') {
  // Un ouvrage : une liste vide ne se publie pas et n'est jamais visible des étudiants.
  return prisma.readingList.create({ data: { ownerId, departmentId, title: `${title} ${world.suffix}`, status, items: { create: { bookId: world.books[0], position: 0 } } } });
}

async function publish(listId: string, body: Record<string, unknown>) {
  return read(await patchList(jsonRequest('PATCH', body), params({ id: listId })));
}

beforeAll(async () => {
  world = await createWorld(2);
  extra.studentA2 = await makeUser('sa2', 'STUDENT', 'ACTIVE', world.deptA.id);
  extra.suspendedStudentA = await makeUser('ssa', 'STUDENT', 'SUSPENDED', world.deptA.id);
  extra.studentB = await makeUser('sb', 'STUDENT', 'ACTIVE', world.deptB.id);
  deptC = await prisma.department.create({
    data: { slug: `test-dept-c-${world.suffix}`, name: `Département C ${world.suffix}`, facultyId: world.facultyId, sortOrder: 999 },
    select: { id: true, slug: true },
  });
  extra.teacherC = await makeUser('tc', 'TEACHER', 'ACTIVE', deptC.id);
}, 60_000);

beforeEach(() => {
  authMock.mockReset();
  jar.proof = undefined;
});

afterAll(async () => {
  const ids = [...Object.values(extra), ...massIds];
  await prisma.readingList.deleteMany({ where: { departmentId: deptC.id } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.activityLog.deleteMany({ where: { userId: { in: ids } } });
  await prisma.readingList.deleteMany({ where: { ownerId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.department.deleteMany({ where: { id: deptC.id } });
  await cleanupWorld(world, startedAt);
}, 60_000);

describe('« Pour vous » sur le tableau de bord', () => {
  let listA: { id: string; title: string };
  let listB: { id: string; title: string };
  let draftA: { id: string; title: string };

  beforeAll(async () => {
    listA = await draftOf(world.users.teacherA.id, world.deptA.id, 'Pour vous A', 'PUBLISHED');
    listB = await draftOf(world.users.teacherB.id, world.deptB.id, 'Pour vous B', 'PUBLISHED');
    draftA = await draftOf(world.users.teacherA.id, world.deptA.id, 'Brouillon A');
  });

  it('étudiant A : liste publiée de son département seulement (ni B, ni brouillon)', async () => {
    asProfile('student');
    const markup = html(await Dashboard());

    expect(markup).toContain('Listes de lecture pour vous');
    expect(markup).toContain(listA.title);
    expect(markup).toContain('Voir toutes les listes');
    expect(markup).not.toContain(listB.title);
    expect(markup).not.toContain(draftA.title);
  });

  it('au plus 3 listes, les plus récemment modifiées', async () => {
    const more = [];
    for (let i = 0; i < 4; i++) more.push(await draftOf(world.users.teacherA2.id, world.deptA.id, `Recente ${i}`, 'PUBLISHED'));
    asProfile('student');
    const markup = html(await Dashboard());

    expect(more.slice(1).every((list) => markup.includes(list.title))).toBe(true);
    expect(markup).not.toContain(more[0].title);
    expect(markup).not.toContain(listA.title);
    await prisma.readingList.deleteMany({ where: { id: { in: more.map((list) => list.id) } } });
  });

  it('aucun nom d’enseignant par défaut ; affiché si l’indicateur est activé', async () => {
    const saved = process.env.READING_LISTS_SHOW_TEACHER_NAME;
    asProfile('student');
    try {
      delete process.env.READING_LISTS_SHOW_TEACHER_NAME;
      expect(html(await Dashboard())).not.toContain(world.users.teacherA.firstName);
      process.env.READING_LISTS_SHOW_TEACHER_NAME = 'true';
      expect(html(await Dashboard())).toContain(world.users.teacherA.firstName);
    } finally {
      if (saved === undefined) delete process.env.READING_LISTS_SHOW_TEACHER_NAME;
      else process.env.READING_LISTS_SHOW_TEACHER_NAME = saved;
    }
  });

  it('utilisateur sans département : section absente, aucune requête de listes', async () => {
    asProfile('librarian'); // compte STUDENT sans département
    const queries = countQueries();
    const markup = html(await Dashboard());

    expect(markup).not.toContain('Listes de lecture pour vous');
    expect(queries.calls('readingList.findMany')).toBe(0);
    expect(queries.total()).toBe(7);
    queries.restore();
  });

  it('département sans liste publiée : section absente', async () => {
    as(extra.teacherC);
    expect(html(await Dashboard())).not.toContain('Listes de lecture pour vous');
  });

  it('nombre de requêtes : 7 avant (référence), 8 avec un département (UNE requête de listes)', async () => {
    asProfile('student');
    const queries = countQueries();
    await Dashboard();

    expect(queries.calls('readingList.findMany')).toBe(1);
    expect(queries.total()).toBe(8);
    queries.restore();
  });

  describe('filtre par défaut de /listes-de-lecture', () => {
    it('sans paramètre : département de l’utilisateur (relu en base)', async () => {
      asProfile('student');
      const markup = html(await MemberListsPage(sp()));

      expect(markup).toContain(listA.title);
      expect(markup).not.toContain(listB.title);
      expect(markup).toMatch(/aria-current="page"[^>]*>Mon département</);
    });

    it('le JWT ne décide pas : un département prétendu par la session est ignoré', async () => {
      authMock.mockResolvedValue(sessionFor(world.users.student.id, { departmentId: world.deptB.id }));
      const markup = html(await MemberListsPage(sp()));

      expect(markup).toContain(listA.title);
      expect(markup).not.toContain(listB.title);
    });

    it('departement=all : tous les départements', async () => {
      asProfile('student');
      const markup = html(await MemberListsPage(sp({ departement: 'all' })));

      expect(markup).toContain(listA.title);
      expect(markup).toContain(listB.title);
      expect(markup).toMatch(/aria-current="page"[^>]*>Tous les départements</);
    });

    it('département explicite : comportement inchangé', async () => {
      asProfile('student');
      const markup = html(await MemberListsPage(sp({ departement: world.deptB.slug })));

      expect(markup).toContain(listB.title);
      expect(markup).not.toContain(listA.title);
      expect(html(await MemberListsPage(sp({ departement: 'inconnu-xyz' })))).not.toContain(listA.title);
    });

    it('sans département connu : « Tous » par défaut, pas de lien « Mon département »', async () => {
      asProfile('librarian');
      const markup = html(await MemberListsPage(sp()));

      expect(markup).toContain(listA.title);
      expect(markup).toContain(listB.title);
      expect(markup).not.toContain('Mon département');
    });
  });
});

describe('notification à la publication', () => {
  it('sans la case : publication, aucune notification, notified = 0', async () => {
    const list = await draftOf(world.users.teacherA.id, world.deptA.id, 'Sans case');
    asProfile('teacherA');
    const { status, body } = await publish(list.id, { status: 'PUBLISHED' });

    expect(status).toBe(200);
    expect(body.data).toMatchObject({ status: 'PUBLISHED', notified: 0 });
    expect(await notificationsOf(list.id)).toHaveLength(0);
  });

  it('avec la case : seulement les étudiants ACTIVE du département, texte sans donnée personnelle', async () => {
    const list = await draftOf(world.users.teacherA.id, world.deptA.id, 'Avec case');
    asProfile('teacherA');
    const { status, body } = await publish(list.id, { status: 'PUBLISHED', notifyStudents: true });
    const rows = await notificationsOf(list.id);
    const expected = [world.users.student.id, world.users.jwtLiar.id, extra.studentA2].sort();

    expect(status).toBe(200);
    expect(body.data.notified).toBe(3);
    expect(rows.map((row) => row.userId).sort()).toEqual(expected);
    // Ni suspendu, ni autre département, ni enseignants (dont l'auteur et le responsable A).
    for (const excluded of [extra.suspendedStudentA, extra.studentB, world.users.teacherA.id, world.users.teacherA2.id, world.users.managerA.id]) {
      expect(rows.some((row) => row.userId === excluded)).toBe(false);
    }
    for (const row of rows) {
      expect(row).toMatchObject({
        type: 'GENERAL',
        source: 'site',
        title: 'Nouvelle liste de lecture',
        dedupeKey: readingListDedupeKey(list.id, row.userId),
        message: `Une nouvelle liste de lecture est disponible pour votre département : "${list.title}". Consultez Listes de lecture.`,
      });
      expect(row.message).not.toContain(world.users.teacherA.firstName);
      expect(row.message).not.toContain('@');
    }

    const log = await prisma.activityLog.findFirst({ where: { action: 'reading_list.publish', userId: world.users.teacherA.id }, orderBy: { createdAt: 'desc' } });
    expect(log?.details).toEqual({ listId: list.id, departmentId: world.deptA.id, notified: 3, notNotified: 0 });
  });

  it('idempotence : dépublier puis republier avec la case ne renotifie pas ; un étudiant arrivé plus tard ne reçoit rien', async () => {
    const list = await draftOf(world.users.teacherA.id, world.deptA.id, 'Republiee');
    asProfile('teacherA');
    await publish(list.id, { status: 'PUBLISHED', notifyStudents: true });
    expect(await notificationsOf(list.id)).toHaveLength(3);

    const late = await makeUser('late', 'STUDENT', 'ACTIVE', world.deptA.id);
    expect((await publish(list.id, { status: 'DRAFT' })).body.data.notified).toBe(0);
    const again = await publish(list.id, { status: 'PUBLISHED', notifyStudents: true });

    expect(again.status).toBe(200);
    expect(again.body.data).toMatchObject({ notified: 0, alreadyNotified: true });
    expect(await notificationsOf(list.id)).toHaveLength(3);
    expect(await prisma.notification.count({ where: { userId: late } })).toBe(0);
    await prisma.user.delete({ where: { id: late } });
  });

  it('case envoyée sans changement de statut (liste déjà publiée) : ignorée', async () => {
    const list = await draftOf(world.users.teacherA.id, world.deptA.id, 'Deja publiee', 'PUBLISHED');
    asProfile('teacherA');
    const { status, body } = await publish(list.id, { status: 'PUBLISHED', notifyStudents: true });

    expect(status).toBe(200);
    expect(body.data.notified).toBe(0);
    expect(await notificationsOf(list.id)).toHaveLength(0);
  });

  it('Zod : booléen exigé, et la case seule ne constitue pas une modification', async () => {
    const list = await draftOf(world.users.teacherA.id, world.deptA.id, 'Zod');
    asProfile('teacherA');

    expect((await publish(list.id, { status: 'PUBLISHED', notifyStudents: 'oui' })).status).toBe(400);
    expect((await publish(list.id, { notifyStudents: true })).status).toBe(400);
    expect((await prisma.readingList.findUniqueOrThrow({ where: { id: list.id } })).status).toBe('DRAFT');
  });

  it('l’auteur est exclu des destinataires (même s’il était étudiant)', async () => {
    const list = await draftOf(world.users.teacherA.id, world.deptA.id, 'Auteur exclu');
    const result = await prisma.$transaction((tx) => notifyReadingListPublished(tx, { id: list.id, title: list.title, departmentId: world.deptA.id }, world.users.student.id));

    expect(result.notified).toBe(2);
    expect((await notificationsOf(list.id)).some((row) => row.userId === world.users.student.id)).toBe(false);
  });

  it('département vide : aucun destinataire', async () => {
    const result = await prisma.$transaction((tx) => notifyReadingListPublished(tx, { id: `vide-${randomUUID()}`, title: 'x', departmentId: null }, world.users.teacherA.id));

    expect(result).toEqual({ notified: 0, notNotified: 0, alreadyNotified: false });
  });

  it('IDOR : la liste d’un autre enseignant → 404, ni publication ni notification', async () => {
    const list = await draftOf(world.users.teacherA.id, world.deptA.id, 'Idor');

    for (const intruder of ['teacherA2', 'teacherB', 'managerA'] as const) {
      asProfile(intruder);
      expect((await publish(list.id, { status: 'PUBLISHED', notifyStudents: true })).status).toBe(404);
    }
    for (const staff of ['librarian', 'admin'] as const) {
      asProfile(staff);
      expect((await publish(list.id, { status: 'PUBLISHED', notifyStudents: true })).status).toBe(403);
    }
    expect((await prisma.readingList.findUniqueOrThrow({ where: { id: list.id } })).status).toBe('DRAFT');
    expect(await notificationsOf(list.id)).toHaveLength(0);
  });

  it('transaction : échec de la publication → aucune notification, liste toujours en brouillon', async () => {
    const list = await draftOf(world.users.teacherA.id, world.deptA.id, 'Echec');
    const original = prisma.$transaction.bind(prisma) as (fn: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: unknown) => Promise<unknown>;
    const spy = vi.spyOn(prisma, '$transaction').mockImplementationOnce(((fn: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: unknown) =>
      original(
        (tx) =>
          fn(
            new Proxy(tx, {
              get: (target, property) =>
                property === 'activityLog'
                  ? { create: async () => { throw new Error('échec simulé du journal'); } }
                  : Reflect.get(target, property),
            })
          ),
        options
      )) as never);
    asProfile('teacherA');
    const { status } = await publish(list.id, { status: 'PUBLISHED', notifyStudents: true });
    spy.mockRestore();

    expect(status).toBe(500);
    expect((await prisma.readingList.findUniqueOrThrow({ where: { id: list.id } })).status).toBe('DRAFT');
    expect(await notificationsOf(list.id)).toHaveLength(0);
  });

  it('limitation : 5 publications notifiées par jour, 429 générique ensuite (sans publier) ; sans case, pas limité', async () => {
    const key = rateLimitKey('reading-list-notify', world.users.teacherA2.id);
    await prisma.rateLimitBucket.upsert({
      where: { key },
      create: { key, count: RATE_LIMITS.readingListNotify.limit, windowStart: new Date() },
      update: { count: RATE_LIMITS.readingListNotify.limit, windowStart: new Date() },
    });
    const list = await draftOf(world.users.teacherA2.id, world.deptA.id, 'Limitee');
    asProfile('teacherA2');
    const limited = await publish(list.id, { status: 'PUBLISHED', notifyStudents: true });

    expect(limited.status).toBe(429);
    expect(limited.body.message).not.toMatch(/notif|étudiant/i);
    expect((await prisma.readingList.findUniqueOrThrow({ where: { id: list.id } })).status).toBe('DRAFT');
    expect(await notificationsOf(list.id)).toHaveLength(0);

    expect((await publish(list.id, { status: 'PUBLISHED' })).status).toBe(200);
    await prisma.rateLimitBucket.delete({ where: { key } });
  });

  it('dépublication par l’enseignant ou par la bibliothèque : aucun étudiant notifié', async () => {
    const list = await draftOf(world.users.teacherA.id, world.deptA.id, 'Depubliee', 'PUBLISHED');
    const studentIds = [world.users.student.id, world.users.jwtLiar.id, extra.studentA2];
    const before = await prisma.notification.count({ where: { userId: { in: studentIds } } });

    asProfile('teacherA');
    expect((await publish(list.id, { status: 'DRAFT' })).status).toBe(200);
    await prisma.readingList.update({ where: { id: list.id }, data: { status: 'PUBLISHED' } });
    for (const staff of ['admin', 'librarian'] as const) {
      asProfile(staff);
      const response = await staffUnpublish(jsonRequest('POST', { reason: 'Contenu à revoir' }), params({ id: list.id }));
      expect([200, 409]).toContain(response.status);
    }

    expect(await prisma.notification.count({ where: { userId: { in: studentIds } } })).toBe(before);
    expect(await notificationsOf(list.id)).toHaveLength(0);
  });

  it('page enseignant : case décochée par défaut et nombre approximatif de destinataires', async () => {
    const list = await draftOf(world.users.teacherA.id, world.deptA.id, 'Page');
    asProfile('teacherA');
    const markup = html(await TeacherListPage({ params: Promise.resolve({ id: list.id }), searchParams: Promise.resolve({}) }));

    expect(markup).toContain('Prévenir les étudiants de mon département (une seule fois par liste)');
    expect(markup).toContain('Environ 3 étudiants seront prévenus');
    expect(markup).not.toMatch(/type="checkbox"[^>]*checked/);
  });
});

describe('volume : lots de 500 et plafond de 3000', () => {
  beforeAll(async () => {
    const tag = world.suffix;
    await prisma.user.createMany({
      data: Array.from({ length: MASS }, (_, i) => ({
        email: `rln-mass-${i}-${tag}@test.local`,
        username: `rln_mass_${i}_${tag}`,
        password: 'x',
        firstName: 'Masse',
        lastName: 'Test',
        role: 'STUDENT' as const,
        status: 'ACTIVE' as const,
        departmentId: deptC.id,
      })),
    });
    massIds.push(...(await prisma.user.findMany({ where: { email: { startsWith: 'rln-mass-', endsWith: `-${tag}@test.local` } }, select: { id: true } })).map((u) => u.id));
  }, 120_000);

  it(`${MASS} étudiants : 3000 prévenus par lots de 500, écart rapporté dans la réponse et le journal`, async () => {
    const list = await draftOf(extra.teacherC, deptC.id, 'Masse');
    as(extra.teacherC);
    const { status, body } = await publish(list.id, { status: 'PUBLISHED', notifyStudents: true });

    expect(status).toBe(200);
    expect(body.data).toMatchObject({ notified: READING_LIST_NOTIFY.maxRecipients, notNotified: 5 });
    expect(body.message).toContain('plafond');
    expect(await prisma.notification.count({ where: { dedupeKey: { startsWith: prefix(list.id) } } })).toBe(READING_LIST_NOTIFY.maxRecipients);

    const log = await prisma.activityLog.findFirst({ where: { action: 'reading_list.publish', userId: extra.teacherC }, orderBy: { createdAt: 'desc' } });
    expect(log?.details).toEqual({ listId: list.id, departmentId: deptC.id, notified: 3000, notNotified: 5 });
  }, 120_000);

  it('lots de 500 au plus (contrôle direct sur un client de transaction espionné)', async () => {
    const list = await draftOf(extra.teacherC, deptC.id, 'Lots');
    const sizes: number[] = [];
    const result = await prisma.$transaction(
      (tx) =>
        notifyReadingListPublished(
          new Proxy(tx, {
            get: (target, property) =>
              property === 'notification'
                ? new Proxy(target.notification, {
                    get: (n, p) =>
                      p === 'createMany'
                        ? (args: { data: unknown[] }) => {
                            sizes.push(args.data.length);
                            return n.createMany(args as never);
                          }
                        : Reflect.get(n, p),
                  })
                : Reflect.get(target, property),
          }),
          { id: list.id, title: list.title, departmentId: deptC.id },
          extra.teacherC
        ),
      { timeout: 60_000 }
    );

    expect(result.notified).toBe(3000);
    expect(sizes).toEqual(Array(6).fill(500));
  }, 120_000);
});
