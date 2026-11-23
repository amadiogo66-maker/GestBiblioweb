import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { prisma } from './helpers/local-db';
import { cleanupWorld, createWorld, jsonRequest, pageOutcome, params, proofFor, sessionFor, type Profile, type World } from './helpers/department-fixtures';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
const jar = vi.hoisted(() => ({ proof: undefined as string | undefined }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => (jar.proof ? { value: jar.proof } : undefined) }) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => '/listes-de-lecture',
}));

const { auth } = await import('@/lib/auth');
const { rateLimitKey } = await import('@/lib/rate-limit');
const { READING_LIST_QUOTAS, RATE_LIMITS } = await import('@/lib/constants');
const { POST: createList } = await import('@/app/api/teacher/reading-lists/route');
const { PATCH: patchList, DELETE: deleteList } = await import('@/app/api/teacher/reading-lists/[id]/route');
const { POST: addItem } = await import('@/app/api/teacher/reading-lists/[id]/items/route');
const { PATCH: patchItem, DELETE: deleteItem } = await import('@/app/api/teacher/reading-lists/[id]/items/[itemId]/route');
const { POST: unpublish } = await import('@/app/api/staff/reading-lists/[id]/unpublish/route');
const { default: TeacherListsPage } = await import('@/app/(dashboard)/enseignant/listes/page');
const { default: TeacherListPage } = await import('@/app/(dashboard)/enseignant/listes/[id]/page');
const { default: MemberListsPage } = await import('@/app/(dashboard)/listes-de-lecture/page');
const { default: MemberListPage } = await import('@/app/(dashboard)/listes-de-lecture/[id]/page');
const { default: DeptDashboard } = await import('@/app/(staff)/personnel/(protected)/departement/page');
const { default: DeptProposals } = await import('@/app/(staff)/personnel/(protected)/departement/propositions/page');
const { default: DeptLists } = await import('@/app/(staff)/personnel/(protected)/departement/listes/page');
const { default: LibraryQueue } = await import('@/app/(staff)/personnel/(protected)/acquisitions/page');
const { default: AccountsPage } = await import('@/app/(staff)/personnel/(protected)/comptes/page');
const { default: StaffHome } = await import('@/app/(staff)/personnel/(protected)/page');

const authMock = vi.mocked(auth as unknown as (...args: unknown[]) => Promise<unknown>);
const startedAt = new Date();
let world: World;

/** Connecte un profil : session (JWT simulé) + preuve MFA pour le personnel. */
function as(profile: Profile | null, claims: Record<string, unknown> = {}): void {
  const id = profile ? world.users[profile].id : null;
  jar.proof = id ? proofFor(id) : undefined;
  authMock.mockResolvedValue(sessionFor(id, claims));
}

const read = async (response: Response) => ({ status: response.status, body: await response.json() });
const sp = (value: Record<string, string> = {}) => ({ searchParams: Promise.resolve(value) });
const html = (value: unknown) => renderToStaticMarkup(value as ReactElement);

async function listOf(owner: Profile, status: 'DRAFT' | 'PUBLISHED' = 'DRAFT', title = 'Liste') {
  const user = world.users[owner];
  const dept = (await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { departmentId: true } })).departmentId!;
  return prisma.readingList.create({ data: { ownerId: user.id, departmentId: dept, title: `${title} ${world.suffix}`, status } });
}

beforeAll(async () => {
  world = await createWorld(8);
});

beforeEach(() => {
  authMock.mockReset();
  jar.proof = undefined;
});

afterAll(async () => {
  await cleanupWorld(world, startedAt);
});

describe('matrice d’accès : pages', () => {
  const teacherPage = () => TeacherListsPage();
  const deptPage = (slug?: string) => DeptDashboard(sp(slug ? { departement: slug } : {}));

  it.each<[string, Profile | null, string]>([
    ['non connecté', null, 'redirect:/connexion'],
    ['étudiant', 'student', 'notFound'],
    ['JWT prétendant TEACHER (étudiant en base)', 'jwtLiar', 'notFound'],
    ['responsable A (enseignant en base)', 'managerA', 'render'],
    ['enseignant sans département', 'teacherNoDept', 'render'],
    ['enseignant', 'teacherA', 'render'],
    ['bibliothécaire (étudiant en base)', 'librarian', 'notFound'],
  ])('/enseignant/listes — %s : %s', async (_label, profile, expected) => {
    as(profile);
    const outcome = await pageOutcome(teacherPage);

    expect(outcome.kind === 'redirect' ? `redirect:${outcome.target}` : outcome.kind).toBe(expected);
  });

  it('/enseignant/listes — enseignant sans département : message clair, aucun bouton de création', async () => {
    as('teacherNoDept');
    const markup = html(await teacherPage());

    expect(markup).toContain('Contactez la bibliothèque');
    expect(markup).not.toContain('Nouvelle liste');
  });

  it.each<[string, Profile | null, string]>([
    ['non connecté', null, 'redirect:/connexion'],
    ['étudiant', 'student', 'render'],
    ['enseignant', 'teacherA', 'render'],
  ])('/listes-de-lecture — %s : %s', async (_label, profile, expected) => {
    as(profile);
    const outcome = await pageOutcome(() => MemberListsPage(sp()));

    expect(outcome.kind === 'redirect' ? `redirect:${outcome.target}` : outcome.kind).toBe(expected);
  });

  it.each<[string, Profile | null, 'A' | 'B' | null, string]>([
    ['non connecté', null, null, 'notFound'],
    ['étudiant', 'student', null, 'notFound'],
    ['enseignant', 'teacherA', null, 'notFound'],
    ['JWT prétendant être du personnel', 'jwtLiar', null, 'notFound'],
    ['responsable A, son département', 'managerA', 'A', 'render'],
    ['responsable A, département B', 'managerA', 'B', 'notFound'],
    ['responsable B, département A', 'managerB', 'A', 'notFound'],
    ['bibliothécaire, département A', 'librarian', 'A', 'render'],
    ['administrateur, département B', 'admin', 'B', 'render'],
    ['responsable révoqué', 'revokedManager', 'A', 'notFound'],
    ['responsable suspendu', 'suspendedManager', 'A', 'notFound'],
  ])('/personnel/departement — %s : %s', async (_label, profile, dept, expected) => {
    as(profile, { staffRoles: ['ADMIN'], role: 'TEACHER' });
    const slug = dept === 'A' ? world.deptA.slug : dept === 'B' ? world.deptB.slug : undefined;

    expect((await pageOutcome(() => deptPage(slug))).kind).toBe(expected);
  });

  it('département inexistant : notFound, comme un département d’un autre', async () => {
    as('managerA');

    expect((await pageOutcome(() => deptPage('departement-inexistant'))).kind).toBe('notFound');
  });

  it('sans preuve MFA : redirection vers la vérification', async () => {
    as('managerA');
    jar.proof = undefined;
    const outcome = await pageOutcome(() => deptPage(world.deptA.slug));

    expect(outcome).toMatchObject({ kind: 'redirect', target: '/personnel/securite/verification' });
  });

  it.each<[string, Profile, string]>([
    ['responsable : file de la bibliothèque', 'managerA', 'notFound'],
    ['bibliothécaire : file de la bibliothèque', 'librarian', 'render'],
    ['administrateur : file de la bibliothèque', 'admin', 'render'],
  ])('/personnel/acquisitions — %s : %s', async (_label, profile, expected) => {
    as(profile);

    expect((await pageOutcome(() => LibraryQueue(sp()))).kind).toBe(expected);
  });

  it('responsable : comptes du site refusés, accueil du personnel → son département', async () => {
    as('managerA');

    expect((await pageOutcome(() => AccountsPage(sp()))).kind).toBe('notFound');
    expect(await pageOutcome(() => StaffHome())).toMatchObject({ kind: 'redirect', target: '/personnel/departement' });
  });
});

describe('matrice d’accès : API des listes', () => {
  const create = (body: unknown = { title: 'Liste de test' }, origin?: string | null) => createList(jsonRequest('POST', body, { origin }));

  it.each<[string, Profile | null, number]>([
    ['non connecté', null, 401],
    ['étudiant', 'student', 403],
    ['JWT prétendant TEACHER', 'jwtLiar', 403],
    ['bibliothécaire', 'librarian', 403],
    ['responsable suspendu', 'suspendedManager', 401],
    ['enseignant sans département', 'teacherNoDept', 403],
    ['enseignant', 'teacherA', 201],
  ])('création — %s : %i', async (_label, profile, status) => {
    as(profile);

    expect((await create()).status).toBe(status);
  });

  it('enseignant sans département : message clair', async () => {
    as('teacherNoDept');

    expect((await read(await create())).body.message).toContain('Contactez la bibliothèque');
  });

  it('Origin absente ou étrangère : 403, rien n’est créé', async () => {
    as('teacherA');
    const before = await prisma.readingList.count({ where: { ownerId: world.users.teacherA.id } });

    expect((await create(undefined, null)).status).toBe(403);
    expect((await create(undefined, 'https://malveillant.example')).status).toBe(403);
    expect(await prisma.readingList.count({ where: { ownerId: world.users.teacherA.id } })).toBe(before);
  });

  it('la liste appartient au département de l’enseignant, relu en base (jamais du corps)', async () => {
    as('teacherA');
    const response = await create({ title: 'Département imposé', departmentId: world.deptB.id });

    expect(response.status).toBe(400);

    const ok = await read(await create({ title: 'Département imposé' }));
    const list = await prisma.readingList.findUniqueOrThrow({ where: { id: ok.body.data.id } });
    expect(list.departmentId).toBe(world.deptA.id);
  });

  it('programme d’un autre département : refusé', async () => {
    as('teacherB');

    expect((await create({ title: 'Programme étranger', programId: world.programA })).status).toBe(400);
  });

  it('validation : titre vide, trop long, année mal formée', async () => {
    as('teacherA');

    for (const body of [{ title: '' }, { title: 'x'.repeat(151) }, { title: 'Ok', academicYear: '2026-2028' }, { title: 'Ok', courseCode: 'x'.repeat(41) }]) {
      expect((await create(body)).status).toBe(400);
    }
  });
});

describe('IDOR', () => {
  it('un enseignant ne lit ni ne modifie la liste d’un autre (404, comme inexistante)', async () => {
    const list = await listOf('teacherA', 'DRAFT', 'Privée');
    const item = await prisma.readingListItem.create({ data: { listId: list.id, bookId: world.books[0], position: 0 } });
    as('teacherA2');

    expect((await patchList(jsonRequest('PATCH', { title: 'Piratée' }), params({ id: list.id }))).status).toBe(404);
    expect((await patchList(jsonRequest('PATCH', { status: 'PUBLISHED' }), params({ id: list.id }))).status).toBe(404);
    expect((await deleteList(jsonRequest('DELETE'), params({ id: list.id }))).status).toBe(404);
    expect((await addItem(jsonRequest('POST', { bookId: world.books[1] }), params({ id: list.id }))).status).toBe(404);
    expect((await patchItem(jsonRequest('PATCH', { note: 'x' }), params({ id: list.id, itemId: item.id }))).status).toBe(404);
    expect((await deleteItem(jsonRequest('DELETE'), params({ id: list.id, itemId: item.id }))).status).toBe(404);
    expect((await pageOutcome(() => TeacherListPage({ params: Promise.resolve({ id: list.id }), ...sp() }))).kind).toBe('notFound');

    const unchanged = await prisma.readingList.findUniqueOrThrow({ where: { id: list.id }, include: { items: true } });
    expect(unchanged.title).toBe(list.title);
    expect(unchanged.status).toBe('DRAFT');
    expect(unchanged.items).toHaveLength(1);
  });

  it('un ouvrage d’une autre liste ne peut pas être visé par une liste dont on est propriétaire', async () => {
    const mine = await listOf('teacherA2', 'DRAFT', 'Mienne');
    const other = await listOf('teacherA', 'DRAFT', 'Autre');
    const otherItem = await prisma.readingListItem.create({ data: { listId: other.id, bookId: world.books[2], position: 0 } });
    as('teacherA2');

    expect((await deleteItem(jsonRequest('DELETE'), params({ id: mine.id, itemId: otherItem.id }))).status).toBe(404);
    expect(await prisma.readingListItem.count({ where: { id: otherItem.id } })).toBe(1);
  });

  it('un étudiant ne voit aucun brouillon : notFound comme une liste inconnue, absente de la liste', async () => {
    const draft = await listOf('teacherA', 'DRAFT', 'Brouillon secret');
    const published = await listOf('teacherA', 'PUBLISHED', 'Publiée visible');
    as('student');

    expect((await pageOutcome(() => MemberListPage({ params: Promise.resolve({ id: draft.id }) }))).kind).toBe('notFound');
    expect((await pageOutcome(() => MemberListPage({ params: Promise.resolve({ id: 'inexistante' }) }))).kind).toBe('notFound');
    expect((await pageOutcome(() => MemberListPage({ params: Promise.resolve({ id: published.id }) }))).kind).toBe('render');

    const markup = html(await MemberListsPage(sp({ departement: world.deptA.slug })));
    expect(markup).toContain('Publiée visible');
    expect(markup).not.toContain('Brouillon secret');
  });

  it('le nom de l’enseignant n’est pas affiché par défaut ; affiché si l’indicateur est activé', async () => {
    const published = await listOf('teacherA', 'PUBLISHED', 'Avec auteur');
    const saved = process.env.READING_LISTS_SHOW_TEACHER_NAME;
    as('student');

    try {
      delete process.env.READING_LISTS_SHOW_TEACHER_NAME;
      expect(html(await MemberListPage({ params: Promise.resolve({ id: published.id }) }))).not.toContain(world.users.teacherA.firstName);
      process.env.READING_LISTS_SHOW_TEACHER_NAME = 'true';
      expect(html(await MemberListPage({ params: Promise.resolve({ id: published.id }) }))).toContain(world.users.teacherA.firstName);
    } finally {
      if (saved === undefined) delete process.env.READING_LISTS_SHOW_TEACHER_NAME;
      else process.env.READING_LISTS_SHOW_TEACHER_NAME = saved;
    }
  });

  it('un responsable B ne voit aucune liste du département A', async () => {
    await listOf('teacherA', 'PUBLISHED', 'Liste de A');
    as('managerB');

    expect((await pageOutcome(() => DeptLists(sp({ departement: world.deptA.slug })))).kind).toBe('notFound');
    expect(html(await DeptLists(sp({ departement: world.deptB.slug })))).not.toContain('Liste de A');
  });
});

describe('règles des listes', () => {
  it('quota de listes : au-delà de 30, 409 avec un message clair', async () => {
    const owner = world.users.teacherB;
    const existing = await prisma.readingList.count({ where: { ownerId: owner.id } });
    await prisma.readingList.createMany({
      data: Array.from({ length: READING_LIST_QUOTAS.listsPerTeacher - existing }, (_, i) => ({ ownerId: owner.id, departmentId: world.deptB.id, title: `Quota ${i}` })),
    });
    as('teacherB');
    const response = await read(await createList(jsonRequest('POST', { title: 'Une de trop' })));

    expect(response.status).toBe(409);
    expect(response.body.message).toContain('30');
    await prisma.readingList.deleteMany({ where: { ownerId: owner.id } });
  });

  it('quota d’ouvrages : au-delà de 100, 409 ; doublon d’ouvrage : 409', async () => {
    const list = await listOf('teacherA', 'DRAFT', 'Pleine');
    const many = Array.from({ length: READING_LIST_QUOTAS.itemsPerList }, (_, i) => ({
      externalId: `TEST-RL-${world.suffix}-quota-${i}`,
      isbn: `97899${world.suffix.replace(/[^0-9]/g, '2').slice(0, 4).padEnd(4, '2')}${String(i).padStart(4, '0')}`,
      title: `Quota ${i}`,
      author: 'Q',
      department: 'Test',
      category: 'Test',
    }));
    await prisma.book.createMany({ data: many });
    const ids = (await prisma.book.findMany({ where: { externalId: { startsWith: `TEST-RL-${world.suffix}-quota-` } }, select: { id: true } })).map((b) => b.id);
    await prisma.readingListItem.createMany({ data: ids.map((bookId, position) => ({ listId: list.id, bookId, position })) });
    as('teacherA');

    const full = await read(await addItem(jsonRequest('POST', { bookId: world.books[3] }), params({ id: list.id })));
    expect(full.status).toBe(409);
    expect(full.body.message).toContain('100');

    await prisma.readingListItem.deleteMany({ where: { listId: list.id, bookId: { in: ids.slice(1) } } });
    const duplicate = await addItem(jsonRequest('POST', { bookId: ids[0] }), params({ id: list.id }));
    expect(duplicate.status).toBe(409);

    await prisma.readingListItem.deleteMany({ where: { listId: list.id } });
    await prisma.book.deleteMany({ where: { id: { in: ids } } });
  });

  it('ouvrage absent du catalogue : 404 (seuls les Book existants)', async () => {
    const list = await listOf('teacherA', 'DRAFT', 'Catalogue');
    as('teacherA');

    expect((await addItem(jsonRequest('POST', { bookId: 'inexistant' }), params({ id: list.id }))).status).toBe(404);
  });

  it('parcours : ajout, note, déplacement, publication, dépublication, retrait, journal', async () => {
    as('teacherA');
    const created = await read(await createList(jsonRequest('POST', { title: 'Parcours', courseCode: 'INF-101', academicYear: '2026-2027', programId: world.programA })));
    const id = created.body.data.id as string;
    const first = await read(await addItem(jsonRequest('POST', { bookId: world.books[4], note: 'Chapitres 1 à 3' }), params({ id })));
    const second = await read(await addItem(jsonRequest('POST', { bookId: world.books[5] }), params({ id })));

    expect(first.status).toBe(201);
    expect((await patchItem(jsonRequest('PATCH', { move: 'up' }), params({ id, itemId: second.body.data.id }))).status).toBe(200);
    expect((await patchItem(jsonRequest('PATCH', { move: 'up' }), params({ id, itemId: second.body.data.id }))).status).toBe(409);
    expect((await patchItem(jsonRequest('PATCH', { note: 'Lecture obligatoire' }), params({ id, itemId: first.body.data.id }))).status).toBe(200);
    const order = await prisma.readingListItem.findMany({ where: { listId: id }, orderBy: { position: 'asc' }, select: { bookId: true, note: true } });
    expect(order.map((item) => item.bookId)).toEqual([world.books[5], world.books[4]]);
    expect(order[1].note).toBe('Lecture obligatoire');

    expect((await read(await patchList(jsonRequest('PATCH', { status: 'PUBLISHED' }), params({ id })))).body.message).toBe('Liste publiée');
    expect((await patchList(jsonRequest('PATCH', { status: 'DRAFT' }), params({ id }))).status).toBe(200);
    expect((await deleteItem(jsonRequest('DELETE'), params({ id, itemId: first.body.data.id }))).status).toBe(200);

    const actions = (await prisma.activityLog.findMany({ where: { userId: world.users.teacherA.id, action: { startsWith: 'reading_list.' } }, select: { action: true } })).map((l) => l.action);
    for (const action of ['reading_list.create', 'reading_list.item_add', 'reading_list.item_update', 'reading_list.publish', 'reading_list.unpublish', 'reading_list.item_remove']) {
      expect(actions).toContain(action);
    }
  });

  it('texte brut : aucun HTML interprété dans les pages', async () => {
    const list = await prisma.readingList.create({
      data: { ownerId: world.users.teacherA.id, departmentId: world.deptA.id, title: '<script>alert(1)</script>', description: '<img src=x onerror=alert(2)>', status: 'PUBLISHED' },
    });
    await prisma.readingListItem.create({ data: { listId: list.id, bookId: world.books[6], position: 0, note: '<b>gras</b>' } });
    as('student');
    const markup = html(await MemberListPage({ params: Promise.resolve({ id: list.id }) }));

    expect(markup).not.toContain('<script>alert(1)');
    expect(markup).not.toContain('<img src=x');
    expect(markup).not.toContain('<b>gras</b>');
    expect(markup).toContain('&lt;script&gt;');
  });

  it('limitation de débit : compteur plein → 429', async () => {
    const key = rateLimitKey('teacher-reading-list', world.users.teacherA2.id);
    const full = { count: RATE_LIMITS.teacherReadingListWrite.limit, windowStart: new Date() };
    await prisma.rateLimitBucket.upsert({ where: { key }, create: { key, ...full }, update: full });
    as('teacherA2');

    expect((await createList(jsonRequest('POST', { title: 'Bloquée' }))).status).toBe(429);
  });

  it('modération : seul ADMIN ou LIBRARIAN dépublie, avec motif journalisé', async () => {
    const list = await listOf('teacherA', 'PUBLISHED', 'À modérer');
    const body = { reason: 'Contenu à revoir' };

    as('managerA');
    expect((await unpublish(jsonRequest('POST', body), params({ id: list.id }))).status).toBe(403);
    as('teacherA');
    expect((await unpublish(jsonRequest('POST', body), params({ id: list.id }))).status).toBe(403);
    as('librarian');
    expect((await unpublish(jsonRequest('POST', { reason: 'x' }), params({ id: list.id }))).status).toBe(400);
    expect((await unpublish(jsonRequest('POST', body), params({ id: list.id }))).status).toBe(200);
    expect((await unpublish(jsonRequest('POST', body), params({ id: list.id }))).status).toBe(409);

    expect((await prisma.readingList.findUniqueOrThrow({ where: { id: list.id } })).status).toBe('DRAFT');
    const log = await prisma.activityLog.findFirst({ where: { userId: world.users.librarian.id, action: 'reading_list.moderation_unpublish' }, orderBy: { createdAt: 'desc' } });
    expect(log?.details).toMatchObject({ listId: list.id, reason: 'Contenu à revoir' });
  });
});

describe('espace du responsable : aucune donnée individuelle', () => {
  it('ni emprunt, ni réservation, ni email d’un tiers', async () => {
    const marker = `MARQUEUR-EMPRUNT-${world.suffix}`;
    const book = await prisma.book.create({
      data: { externalId: `TEST-RL-${world.suffix}-pret`, isbn: `9781${world.suffix.replace(/[^0-9]/g, '3').slice(0, 4).padEnd(4, '3')}00001`, title: marker, author: 'A', department: 'Test', category: 'Test', departmentId: world.deptA.id },
    });
    await prisma.loan.create({ data: { userId: world.users.student.id, bookId: book.id, dueDate: new Date(Date.now() + 86_400_000) } });
    await prisma.reservation.create({ data: { userId: world.users.student.id, bookId: world.books[7], status: 'PENDING' } });
    await prisma.acquisitionRequest.create({
      data: { requesterId: world.users.teacherA.id, departmentId: world.deptA.id, title: 'Ouvrage proposé', author: 'Auteur', justification: 'Indispensable au cours' },
    });
    as('managerA');

    const pages = [
      html(await DeptDashboard(sp({ departement: world.deptA.slug }))),
      html(await DeptProposals(sp({ departement: world.deptA.slug }))),
      html(await DeptLists(sp({ departement: world.deptA.slug }))),
    ];
    for (const markup of pages) {
      expect(markup).not.toContain(marker);
      for (const user of Object.values(world.users)) expect(markup).not.toContain(user.email);
      expect(markup).not.toContain(world.users.student.firstName);
    }
    expect(pages[0]).toContain('Membres actifs rattachés');
    expect(pages[1]).toContain('Ouvrage proposé');

    await prisma.loan.deleteMany({ where: { bookId: book.id } });
    await prisma.book.delete({ where: { id: book.id } });
  });
});
