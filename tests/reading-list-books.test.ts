import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { prisma } from './helpers/local-db';
import { countQueries } from './helpers/query-counter';
import { cleanupWorld, createWorld, jsonRequest, pageOutcome, params, sessionFor, type Profile, type World } from './helpers/department-fixtures';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
// Fiche d'un ouvrage : les boutons d'emprunt (client) lisent la session côté navigateur.
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => '/enseignant/listes',
}));

const { auth } = await import('@/lib/auth');
const { rateLimitKey } = await import('@/lib/rate-limit');
const { EMPTY_LIST_PUBLISH_MESSAGE, EMPTY_PUBLISHED_LIST_WARNING, READING_LIST_QUOTAS } = await import('@/lib/constants');
const { PATCH: patchList } = await import('@/app/api/teacher/reading-lists/[id]/route');
const { POST: addItem } = await import('@/app/api/teacher/reading-lists/[id]/items/route');
const { DELETE: deleteItem } = await import('@/app/api/teacher/reading-lists/[id]/items/[itemId]/route');
const { default: TeacherListPage } = await import('@/app/(dashboard)/enseignant/listes/[id]/page');
const { default: TeacherListsPage } = await import('@/app/(dashboard)/enseignant/listes/page');
const { default: MemberListsPage } = await import('@/app/(dashboard)/listes-de-lecture/page');
const { default: MemberListPage } = await import('@/app/(dashboard)/listes-de-lecture/[id]/page');
const { default: Dashboard } = await import('@/app/(dashboard)/tableau-de-bord/page');
const { default: BookPage } = await import('@/app/(marketing)/ouvrage/[id]/page');

const authMock = vi.mocked(auth as unknown as (...args: unknown[]) => Promise<unknown>);
const startedAt = new Date();
let world: World;
let books: Array<{ id: string; title: string; isbn: string | null }>;

const as = (profile: Profile | null) => authMock.mockResolvedValue(sessionFor(profile ? world.users[profile].id : null));
const read = async (response: Response) => ({ status: response.status, body: await response.json() });
const html = (value: unknown) => renderToStaticMarkup(value as ReactElement);
const editPage = async (id: string, q?: string) => html(await TeacherListPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve(q === undefined ? {} : { q }) }));
const add = async (listId: string, bookId: string) => read(await addItem(jsonRequest('POST', { bookId }), params({ id: listId })));
const publish = async (listId: string, body: Record<string, unknown> = {}) =>
  read(await patchList(jsonRequest('PATCH', { status: 'PUBLISHED', ...body }), params({ id: listId })));

async function newList(owner: Profile = 'teacherA', title = 'Liste', status: 'DRAFT' | 'PUBLISHED' = 'DRAFT') {
  return prisma.readingList.create({ data: { ownerId: world.users[owner].id, departmentId: world.deptA.id, title: `${title} ${world.suffix}`, status } });
}

beforeAll(async () => {
  world = await createWorld(12);
  books = await prisma.book.findMany({ where: { id: { in: world.books } }, orderBy: { externalId: 'asc' }, select: { id: true, title: true, isbn: true } });
});

beforeEach(() => authMock.mockReset());

afterAll(async () => {
  await cleanupWorld(world, startedAt);
});

describe('écran « Ajouter des ouvrages » : recherche du catalogue', () => {
  let list: { id: string };

  beforeAll(async () => {
    list = await newList('teacherA', 'Recherche');
    await prisma.readingListItem.create({ data: { listId: list.id, bookId: books[0].id, position: 0 } });
  });

  it('section bien visible, formulaire GET (fonctionne sans JavaScript), 100 caractères au plus', async () => {
    as('teacherA');
    const markup = await editPage(list.id);

    expect(markup).toContain('Ajouter des ouvrages');
    expect(markup.indexOf('Ajouter des ouvrages')).toBeLessThan(markup.indexOf('Ouvrages choisis'));
    const searchForm = (markup.match(/<form[^>]*>/g) ?? []).find((tag) => tag.includes(`action="/enseignant/listes/${list.id}"`)) ?? '';
    expect(searchForm).toContain('method="get"');
    expect(markup).toMatch(/<input[^>]*name="q"[^>]*maxLength="100"|<input[^>]*maxLength="100"[^>]*name="q"/i);
    expect(markup).toMatch(/<button[^>]*type="submit"[^>]*>[\s\S]*?Rechercher/);
  });

  it('insensible à la casse, 10 résultats au plus, disponibilité affichée, « Déjà dans la liste » sans bouton', async () => {
    as('teacherA');
    const markup = await editPage(list.id, `LIVRE TEST ${world.suffix}`.toLowerCase().toUpperCase());
    const results = markup.match(/<ul[^>]*aria-label="Résultats du catalogue"[\s\S]*?<\/ul>/)?.[0] ?? '';

    expect((results.match(/<li/g) ?? []).length).toBe(10);
    expect(results).toContain('disponible (');
    expect(markup).toContain('Les 10 premiers résultats');
    const first = results.slice(results.indexOf(books[0].title));
    expect(first.slice(0, first.indexOf('</li>'))).toContain('Déjà dans la liste');
    expect(first.slice(0, first.indexOf('</li>'))).not.toContain('>Ajouter<');
    expect((results.match(/>Ajouter</g) ?? []).length).toBe(9);
  });

  it('ISBN, avec ou sans tirets', async () => {
    as('teacherA');
    const isbn = books[5].isbn!;
    const withDashes = `${isbn.slice(0, 3)}-${isbn.slice(3, 8)}-${isbn.slice(8)}`;

    expect(await editPage(list.id, isbn)).toContain(books[5].title);
    expect(await editPage(list.id, withDashes)).toContain(books[5].title);
  });

  it('aucun résultat : message et lien « Proposer son acquisition » avec le titre prérempli', async () => {
    as('teacherA');
    const markup = await editPage(list.id, 'zzz introuvable');

    expect(markup).toContain('Aucun ouvrage du catalogue ne correspond');
    expect(markup).toContain('href="/enseignant/propositions?titre=zzz+introuvable"');
  });

  it('recherche trop longue : ignorée avec un message, sans erreur', async () => {
    as('teacherA');
    const markup = await editPage(list.id, `${'a'.repeat(101)}`);

    expect(markup).toContain('La recherche est limitée à 100 caractères');
    expect(markup).not.toContain('Résultats du catalogue');
  });

  it('nombre de requêtes : UNE requête de recherche ; 6 au total pour un brouillon avec q, 4 pour une liste publiée', async () => {
    as('teacherA');
    const published = await newList('teacherA', 'Publiee requetes', 'PUBLISHED');
    await prisma.readingListItem.create({ data: { listId: published.id, bookId: books[1].id, position: 0 } });

    for (const [id, expected] of [
      [list.id, 6],
      [published.id, 4],
    ] as const) {
      const queries = countQueries();
      await editPage(id, `livre test ${world.suffix}`);
      expect(queries.calls('book.findMany')).toBe(1);
      expect(queries.calls('readingListItem.findMany')).toBe(0);
      expect(queries.total()).toBe(expected);
      queries.restore();
    }
  });

  it('un autre enseignant ou un étudiant : page introuvable', async () => {
    for (const profile of ['teacherA2', 'student'] as const) {
      as(profile);
      expect((await pageOutcome(() => TeacherListPage({ params: Promise.resolve({ id: list.id }), searchParams: Promise.resolve({ q: 'livre' }) }))).kind).toBe('notFound');
    }
  });
});

describe('ajout et retrait', () => {
  it('propriétaire : ajout puis retrait ; doublon 409 ; ouvrage inconnu 404', async () => {
    const list = await newList('teacherA', 'Ajout');
    as('teacherA');
    const added = await add(list.id, books[2].id);

    expect(added.status).toBe(201);
    expect((await add(list.id, books[2].id)).status).toBe(409);
    expect((await add(list.id, 'ouvrage-inconnu')).status).toBe(404);
    const removed = await read(await deleteItem(jsonRequest('DELETE'), params({ id: list.id, itemId: added.body.data.id })));
    expect(removed.status).toBe(200);
    expect(await prisma.readingListItem.count({ where: { listId: list.id } })).toBe(0);
  });

  it('IDOR, étudiant, non connecté : refusés, rien n’est écrit', async () => {
    const list = await newList('teacherA', 'Protegee');
    const item = await prisma.readingListItem.create({ data: { listId: list.id, bookId: books[3].id, position: 0 } });

    for (const [profile, status] of [
      ['teacherA2', 404],
      ['teacherB', 404],
      ['student', 403],
      [null, 401],
    ] as const) {
      as(profile);
      expect((await add(list.id, books[4].id)).status).toBe(status);
      expect((await deleteItem(jsonRequest('DELETE'), params({ id: list.id, itemId: item.id }))).status).toBe(status);
    }
    expect(await prisma.readingListItem.count({ where: { listId: list.id } })).toBe(1);
  });

  it(`quota de ${READING_LIST_QUOTAS.itemsPerList} ouvrages : 409 au-delà`, async () => {
    const list = await newList('teacherA', 'Quota');
    await prisma.book.createMany({
      data: Array.from({ length: READING_LIST_QUOTAS.itemsPerList }, (_, i) => ({ externalId: `TEST-RL-${world.suffix}-q${i}`, isbn: `QUOTA-${world.suffix}-${i}`, title: `Quota ${i}`, author: 'Q', department: 'Test', category: 'Test' })),
    });
    const quotaBooks = await prisma.book.findMany({ where: { externalId: { startsWith: `TEST-RL-${world.suffix}-q` } }, select: { id: true } });
    await prisma.readingListItem.createMany({ data: quotaBooks.map((book, position) => ({ listId: list.id, bookId: book.id, position })) });
    as('teacherA');

    expect((await add(list.id, books[6].id)).status).toBe(409);
    expect(await editPage(list.id, `livre test ${world.suffix}`)).toContain('Liste complète');
  });
});

describe('listes vides', () => {
  it('publication d’une liste vide : 409 avec le message, liste restée en brouillon, limite de notification non consommée', async () => {
    const list = await newList('teacherA', 'Vide');
    as('teacherA');

    expect(await publish(list.id)).toEqual({ status: 409, body: { success: false, message: EMPTY_LIST_PUBLISH_MESSAGE } });
    expect((await publish(list.id, { notifyStudents: true })).status).toBe(409);
    expect((await prisma.readingList.findUniqueOrThrow({ where: { id: list.id } })).status).toBe('DRAFT');
    expect(await prisma.notification.count({ where: { dedupeKey: { startsWith: `reading-list:${list.id}:` } } })).toBe(0);
    expect(await prisma.rateLimitBucket.count({ where: { key: rateLimitKey('reading-list-notify', world.users.teacherA.id) } })).toBe(0);
  });

  it('interface : « Publier » et la case désactivés, avec l’explication ; actifs après l’ajout d’un ouvrage', async () => {
    const list = await newList('teacherA', 'Interface');
    as('teacherA');
    const empty = await editPage(list.id);

    expect(empty).toMatch(/<button[^>]*disabled=""[^>]*aria-describedby="publish-empty-help"[^>]*>Publier la liste/);
    expect(empty).toMatch(/<input type="checkbox"[^>]*disabled=""/);
    expect(empty).toContain(`id="publish-empty-help"`);
    expect(empty).toContain(EMPTY_LIST_PUBLISH_MESSAGE);

    await add(list.id, books[7].id);
    const filled = await editPage(list.id);
    expect(filled).not.toContain('publish-empty-help');
    expect(filled).not.toMatch(/<input type="checkbox"[^>]*disabled=""/);
    expect((await publish(list.id)).status).toBe(200);
  });

  it('un étudiant ne voit jamais une liste vide ; il la voit avec un ouvrage ; retirer le dernier la cache (toujours publiée)', async () => {
    const list = await newList('teacherA', 'Visibilite', 'PUBLISHED');
    const visible = async () => {
      as('student');
      const [forYou, lists, detail] = [html(await Dashboard()), html(await MemberListsPage({ searchParams: Promise.resolve({ departement: 'all' }) })), await pageOutcome(() => MemberListPage({ params: Promise.resolve({ id: list.id }) }))];
      return { forYou: forYou.includes(list.title), lists: lists.includes(list.title), detail: detail.kind };
    };

    expect(await visible()).toEqual({ forYou: false, lists: false, detail: 'notFound' });
    expect((await pageOutcome(() => MemberListPage({ params: Promise.resolve({ id: 'inconnue' }) }))).kind).toBe('notFound');

    as('teacherA');
    const added = await add(list.id, books[8].id);
    expect(await visible()).toEqual({ forYou: true, lists: true, detail: 'render' });

    as('teacherA');
    await deleteItem(jsonRequest('DELETE'), params({ id: list.id, itemId: added.body.data.id }));
    expect(await visible()).toEqual({ forYou: false, lists: false, detail: 'notFound' });
    expect((await prisma.readingList.findUniqueOrThrow({ where: { id: list.id } })).status).toBe('PUBLISHED');
  });

  it('comptage des listes de /listes-de-lecture : la liste vide n’est pas comptée', async () => {
    await newList('teacherB', 'Vide comptee', 'PUBLISHED');
    as('student');
    const markup = html(await MemberListsPage({ searchParams: Promise.resolve({ departement: world.deptA.slug }) }));
    const count = Number(markup.replaceAll('<!-- -->', '').match(/(\d+) listes? publiées?/)?.[1]);
    const expected = await prisma.readingList.count({ where: { departmentId: world.deptA.id, status: 'PUBLISHED', items: { some: {} } } });

    expect(count).toBe(expected);
  });

  it('enseignant : département affiché et avertissement « Publiée mais vide » (liste et édition)', async () => {
    const list = await newList('teacherA', 'Avertie', 'PUBLISHED');
    as('teacherA');
    const lists = html(await TeacherListsPage());
    const block = lists.slice(lists.indexOf(list.title));

    expect(block.slice(0, block.indexOf('</li>'))).toContain(EMPTY_PUBLISHED_LIST_WARNING);
    expect(lists).toContain(`Département A ${world.suffix}`);
    expect(await editPage(list.id)).toContain(EMPTY_PUBLISHED_LIST_WARNING);
  });
});

describe('fiche d’un ouvrage : « Ajouter à une de mes listes »', () => {
  it('enseignant : ses listes, celle qui contient déjà l’ouvrage désactivée ; étudiant : rien', async () => {
    const withBook = await newList('teacherA2', 'Fiche avec');
    const without = await newList('teacherA2', 'Fiche sans');
    await prisma.readingListItem.create({ data: { listId: withBook.id, bookId: books[9].id, position: 0 } });

    as('teacherA2');
    const markup = html(await BookPage({ params: Promise.resolve({ id: books[9].id }) }));
    expect(markup).toContain('Ajouter à une de mes listes');
    expect(markup).toMatch(new RegExp(`<option value="${withBook.id}" disabled="">[^<]*\\(déjà dans la liste\\)`));
    expect(markup).toContain(`value="${without.id}"`);

    as('student');
    expect(html(await BookPage({ params: Promise.resolve({ id: books[9].id }) }))).not.toContain('Ajouter à une de mes listes');
  });
});
