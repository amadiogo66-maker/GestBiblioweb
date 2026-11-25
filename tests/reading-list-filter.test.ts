import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement, type ReactElement } from 'react';
import { prisma } from './helpers/local-db';
import { countQueries } from './helpers/query-counter';
import { cleanupWorld, createWorld, sessionFor, type Profile, type World } from './helpers/department-fixtures';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => '/listes-de-lecture',
}));

const { auth } = await import('@/lib/auth');
const { default: MemberListsPage } = await import('@/app/(dashboard)/listes-de-lecture/page');
const { AutoSubmitSelect } = await import('@/components/shared/AutoSubmitSelect');

const authMock = vi.mocked(auth as unknown as (...args: unknown[]) => Promise<unknown>);
const startedAt = new Date();
let world: World;
let programA: { slug: string; name: string };
let programB: { slug: string; name: string };
let listA: { title: string };
let listAProgram: { title: string };
let listB: { title: string };

const as = (profile: Profile) => authMock.mockResolvedValue(sessionFor(world.users[profile].id));
const render = async (params: Record<string, string> = {}) =>
  renderToStaticMarkup((await MemberListsPage({ searchParams: Promise.resolve(params) })) as ReactElement);

/** Le <select name="programme"> rendu, seul. */
const programSelect = (markup: string) => markup.match(/<select[^>]*name="programme"[\s\S]*?<\/select>/)?.[0] ?? '';
const help = 'Choisissez un département pour filtrer par programme';

beforeAll(async () => {
  world = await createWorld(1);
  programA = await prisma.program.findUniqueOrThrow({ where: { id: world.programA }, select: { slug: true, name: true } });
  programB = await prisma.program.create({
    data: { slug: `test-prog-b-${world.suffix}`, name: `DUT B ${world.suffix}`, level: 'DUT', departmentId: world.deptB.id, sortOrder: 1 },
    select: { slug: true, name: true },
  });
  const make = (owner: Profile, departmentId: string, title: string, programId: string | null = null) =>
    prisma.readingList.create({ data: { ownerId: world.users[owner].id, departmentId, programId, title: `${title} ${world.suffix}`, status: 'PUBLISHED', items: { create: { bookId: world.books[0], position: 0 } } } });
  listA = await make('teacherA', world.deptA.id, 'Liste A');
  listAProgram = await make('teacherA', world.deptA.id, 'Liste A programme', world.programA);
  listB = await make('teacherB', world.deptB.id, 'Liste B');
});

beforeEach(() => authMock.mockReset());

afterAll(async () => {
  await cleanupWorld(world, startedAt);
});

describe('filtre « Programme » de /listes-de-lecture', () => {
  it('sans paramètre (mon département) : programmes de mon département, champ actif, sans texte d’aide', async () => {
    as('student');
    const markup = await render();
    const select = programSelect(markup);

    expect(select).toContain(programA.name);
    expect(select).not.toContain(programB.name);
    expect(select).not.toContain('disabled=""');
    expect(markup).not.toContain(help);
  });

  it('departement=all : champ désactivé, texte d’aide relié par aria-describedby', async () => {
    as('student');
    const markup = await render({ departement: 'all' });
    const select = programSelect(markup);

    expect(select).toContain('disabled=""');
    expect(select).toContain('aria-describedby="rl-prog-help"');
    expect(markup).toMatch(new RegExp(`id="rl-prog-help"[^>]*>${help}<`));
    expect(select).not.toContain(programA.name);
  });

  it('utilisateur sans département (défaut « Tous ») : même champ désactivé avec aide', async () => {
    as('librarian');
    const markup = await render();

    expect(programSelect(markup)).toContain('disabled=""');
    expect(markup).toContain(help);
  });

  it('département précis : programmes de ce département seulement (changement A → B)', async () => {
    as('student');
    const selectA = programSelect(await render({ departement: world.deptA.slug }));
    // Ce que produit l'envoi automatique au changement : nouveau département, programme vidé.
    const selectB = programSelect(await render({ departement: world.deptB.slug, programme: '' }));

    expect(selectA).toContain(programA.name);
    expect(selectA).not.toContain(programB.name);
    expect(selectB).toContain(programB.name);
    expect(selectB).not.toContain(programA.name);
  });

  it('programme valide : filtre appliqué et présélectionné', async () => {
    as('student');
    const markup = await render({ departement: world.deptA.slug, programme: programA.slug });

    expect(markup).toContain(listAProgram.title);
    expect(markup).not.toContain(listA.title);
    expect(programSelect(markup)).toMatch(new RegExp(`value="${programA.slug}" selected=""`));
  });

  it.each([
    ['programme d’un autre département', () => ({ departement: world.deptB.slug, programme: programA.slug }), () => [listB.title], () => [listA.title]],
    ['programme avec « Tous »', () => ({ departement: 'all', programme: programA.slug }), () => [listA.title, listAProgram.title, listB.title], () => []],
    ['programme étranger avec mon département (sans paramètre)', () => ({ programme: programB.slug }), () => [listA.title, listAProgram.title], () => [listB.title]],
    ['programme inconnu', () => ({ departement: world.deptA.slug, programme: 'inexistant' }), () => [listA.title, listAProgram.title], () => [listB.title]],
  ])('%s : ignoré sans erreur, listes du département, rien de présélectionné', async (_label, params, shown, hidden) => {
    as('student');
    const markup = await render(params());

    for (const title of shown()) expect(markup).toContain(title);
    for (const title of hidden()) expect(markup).not.toContain(title);
    expect(programSelect(markup)).not.toMatch(/value="[^"]+" selected=""/);
    // Le paramètre ignoré n'est pas recopié dans les liens de pagination.
    expect(markup).not.toContain(`programme=${programA.slug}`);
  });

  it('sans JavaScript : formulaire GET valide (département, programme, bouton Filtrer)', async () => {
    as('student');
    const markup = await render();
    const form = markup.match(/<form[^>]*>[\s\S]*?<\/form>/)?.[0] ?? '';

    expect(form).toMatch(/^<form[^>]*method="get"/);
    expect(form).toContain('name="departement"');
    expect(form).toContain('name="programme"');
    expect(form).toMatch(/<button[^>]*type="submit"[^>]*>[\s\S]*Filtrer/);
    expect(form).not.toContain('action=');
  });

  it('nombre de requêtes : 5 avec un département, 4 pour « Tous » ; programmes en UNE requête', async () => {
    as('student');
    for (const [params, expected, programQueries] of [
      [{}, 5, 1],
      [{ departement: world.deptB.slug, programme: programA.slug }, 5, 1],
      [{ departement: 'all' }, 4, 0],
    ] as const) {
      const queries = countQueries();
      await render(params);
      expect(queries.total()).toBe(expected);
      expect(queries.calls('program.findMany')).toBe(programQueries);
      queries.restore();
    }
  });
});

describe('AutoSubmitSelect', () => {
  it('au changement : programme remis à vide puis formulaire envoyé', () => {
    const programme = { value: 'licence-x' };
    const requestSubmit = vi.fn();
    const form = { elements: { namedItem: (name: string) => (name === 'programme' ? programme : null) }, requestSubmit };
    const element = AutoSubmitSelect({ name: 'departement', resetFields: ['programme'], children: null }) as ReactElement<{ onChange: (event: unknown) => void }>;

    element.props.onChange({ currentTarget: { form } });

    expect(programme.value).toBe('');
    expect(requestSubmit).toHaveBeenCalledTimes(1);
  });

  it('rendu serveur : un <select> ordinaire (fonctionne sans JavaScript)', () => {
    const options = [createElement('option', { key: 'a', value: 'a' }, 'A'), createElement('option', { key: 'b', value: 'b' }, 'B')];
    const markup = renderToStaticMarkup(AutoSubmitSelect({ name: 'departement', defaultValue: 'b', children: options }) as ReactElement);

    expect(markup).toBe('<select name="departement"><option value="a">A</option><option value="b" selected="">B</option></select>');
  });
});
