import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { NextRequest } from 'next/server';
import { prisma } from './helpers/local-db';
import { cleanupWorld, createWorld, jsonRequest, pageOutcome, params, proofFor, sessionFor, type Profile, type World } from './helpers/department-fixtures';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
const jar = vi.hoisted(() => ({ proof: undefined as string | undefined }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => (jar.proof ? { value: jar.proof } : undefined) }) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => '/personnel/actualites',
}));

const { auth } = await import('@/lib/auth');
const { rateLimitKey } = await import('@/lib/rate-limit');
const { RATE_LIMITS } = await import('@/lib/constants');
const { evaluateNewsWrite, nextPublishedAt, SOFTWARE_NEWS_READ_ONLY, NEWS_DELETE_ADMIN_ONLY } = await import('@/lib/staff-news');
const { summarizeAuditDetails, auditActionLabel } = await import('@/lib/audit-format');
const { POST: createNews } = await import('@/app/api/staff/news/route');
const { PATCH: patchNews, DELETE: deleteNews } = await import('@/app/api/staff/news/[id]/route');
const { POST: newsSync } = await import('@/app/api/news/sync/route');
const { GET: apiNewsById } = await import('@/app/api/news/[id]/route');
const { GET: apiNewsList } = await import('@/app/api/news/route');
const { default: StaffNewsPage } = await import('@/app/(staff)/personnel/(protected)/actualites/page');
const { default: NewStaffNewsPage } = await import('@/app/(staff)/personnel/(protected)/actualites/nouvelle/page');
const { default: EditStaffNewsPage } = await import('@/app/(staff)/personnel/(protected)/actualites/[id]/page');
const { default: HomePage } = await import('@/app/(marketing)/page');
const { default: PublicNewsList } = await import('@/app/(marketing)/actualites/page');
const { default: PublicNewsPage } = await import('@/app/(marketing)/actualites/[id]/page');

const authMock = vi.mocked(auth as unknown as (...args: unknown[]) => Promise<unknown>);
const startedAt = new Date();
const KEY = randomBytes(24).toString('hex');
const savedKey = process.env.GEST_BIBLIO_API_KEY;
let world: World;
let revokedLibrarian: string;
const createdNews: string[] = [];

function asId(id: string | null, options: { mfa?: boolean; claims?: Record<string, unknown> } = {}): void {
  jar.proof = id && options.mfa !== false ? proofFor(id) : undefined;
  authMock.mockResolvedValue(sessionFor(id, options.claims));
}
const as = (profile: Profile | null, options?: { mfa?: boolean; claims?: Record<string, unknown> }) => asId(profile ? world.users[profile].id : null, options);
const read = async (response: Response) => ({ status: response.status, body: await response.json() });
const html = (value: unknown) => renderToStaticMarkup(value as ReactElement);
const unique = () => randomBytes(4).toString('hex');
const valid = (overrides: Record<string, unknown> = {}) => ({ title: `Actu ${unique()}`, content: 'Un contenu suffisamment long.', category: 'EVENT', ...overrides });

async function create(body: Record<string, unknown>, origin?: string | null) {
  const result = await read(await createNews(jsonRequest('POST', body, { origin })));
  if (result.body.data?.id) createdNews.push(result.body.data.id);
  return result;
}
const patch = async (id: string, body: unknown, origin?: string | null) => read(await patchNews(jsonRequest('PATCH', body, { origin }), params({ id })));
const remove = async (id: string) => read(await deleteNews(jsonRequest('DELETE'), params({ id })));

function sync(body: unknown, key: string | null = KEY) {
  return newsSync(
    new NextRequest('http://localhost/api/news/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key ? { 'x-api-key': key } : {}) },
      body: JSON.stringify(body),
    })
  );
}

async function siteNews(isPublished: boolean, extra: Record<string, unknown> = {}) {
  const news = await prisma.news.create({
    data: { title: `Site ${unique()}`, content: 'Contenu du site assez long', category: 'GENERAL', source: 'SITE', isPublished, publishedAt: isPublished ? new Date() : null, ...extra },
  });
  createdNews.push(news.id);
  return news;
}
async function softwareNews(extra: Record<string, unknown> = {}) {
  const news = await prisma.news.create({ data: { title: `Logiciel ${unique()}`, content: 'Contenu du logiciel', category: 'EVENT', source: 'SOFTWARE', ...extra } });
  createdNews.push(news.id);
  return news;
}

beforeAll(async () => {
  process.env.GEST_BIBLIO_API_KEY = KEY;
  world = await createWorld(1);
  const user = await prisma.user.create({
    data: { email: `news-revoked-${world.suffix}@test.local`, username: `news_revoked_${world.suffix}`, password: 'x', firstName: 'Revoque', lastName: 'Test', status: 'ACTIVE' },
  });
  revokedLibrarian = user.id;
  await prisma.staffAssignment.create({ data: { userId: user.id, role: 'LIBRARIAN', revokedAt: new Date() } });
  await prisma.staffMfa.create({ data: { userId: user.id, secretCipher: 'fixture', enabledAt: new Date(Date.now() - 60_000) } });
});

beforeEach(() => {
  authMock.mockReset();
  jar.proof = undefined;
});

afterAll(async () => {
  if (savedKey === undefined) delete process.env.GEST_BIBLIO_API_KEY;
  else process.env.GEST_BIBLIO_API_KEY = savedKey;
  await prisma.news.deleteMany({ where: { id: { in: createdNews } } });
  await prisma.activityLog.deleteMany({ where: { OR: [{ userId: revokedLibrarian }, { createdAt: { gte: startedAt }, action: { startsWith: 'news.' } }] } });
  await prisma.staffAssignment.deleteMany({ where: { userId: revokedLibrarian } });
  await prisma.staffMfa.deleteMany({ where: { userId: revokedLibrarian } });
  await prisma.user.deleteMany({ where: { id: revokedLibrarian } });
  await cleanupWorld(world, startedAt);
});

describe('accès : pages et API', () => {
  const pages: Array<[string, () => Promise<unknown>]> = [
    ['/personnel/actualites', () => StaffNewsPage({ searchParams: Promise.resolve({}) })],
    ['/personnel/actualites/nouvelle', () => NewStaffNewsPage()],
  ];

  it.each<[string, () => void, string]>([
    // Sans session, le middleware redirige vers /connexion avant la page ; le garde seul répond 404.
    ['non connecté (garde de page)', () => as(null), 'notFound'],
    ['étudiant', () => as('student'), 'notFound'],
    ['enseignant', () => as('teacherA'), 'notFound'],
    ['responsable de département', () => as('managerA'), 'notFound'],
    ['affectation révoquée', () => asId(revokedLibrarian), 'notFound'],
    ['JWT prétendant ADMIN sans affectation', () => as('jwtLiar', { claims: { staffRoles: ['ADMIN'], role: 'ADMIN' } }), 'notFound'],
    ['bibliothécaire sans MFA', () => as('librarian', { mfa: false }), 'redirect:/personnel/securite/verification'],
    ['bibliothécaire', () => as('librarian'), 'render'],
    ['administrateur', () => as('admin'), 'render'],
  ])('pages — %s : %s', async (_label, login, expected) => {
    for (const [, render] of pages) {
      login();
      const outcome = await pageOutcome(render);
      const kind = outcome.kind === 'redirect' ? `redirect:${outcome.target?.split('?')[0]}` : outcome.kind;
      expect(kind).toBe(expected);
    }
  });

  it.each<[string, () => void, number]>([
    ['non connecté', () => as(null), 401],
    ['étudiant', () => as('student'), 403],
    ['enseignant', () => as('teacherA'), 403],
    ['responsable de département', () => as('managerA'), 403],
    ['affectation révoquée', () => asId(revokedLibrarian), 403],
    ['JWT prétendant ADMIN sans affectation', () => as('jwtLiar', { claims: { staffRoles: ['ADMIN'], role: 'ADMIN' } }), 403],
    ['bibliothécaire sans MFA', () => as('librarian', { mfa: false }), 403],
  ])('API — %s : %d, aucune écriture', async (_label, login, status) => {
    const target = await siteNews(false);
    login();

    expect((await create(valid())).status).toBe(status);
    expect((await patch(target.id, { isPublished: true })).status).toBe(status);
    expect((await remove(target.id)).status).toBe(status);
    expect(await prisma.news.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject({ isPublished: false, title: target.title });
  });

  it('API — sans MFA : code mfa_required', async () => {
    as('librarian', { mfa: false });
    expect((await create(valid())).body.code).toBe('mfa_required');
  });

  it('Origin étrangère ou absente : 403 sans écriture', async () => {
    as('librarian');
    const target = await siteNews(false);

    expect((await create(valid(), 'https://evil.example')).status).toBe(403);
    expect((await create(valid(), null)).status).toBe(403);
    expect((await patch(target.id, { isPublished: true }, 'https://evil.example')).status).toBe(403);
    expect((await prisma.news.findUniqueOrThrow({ where: { id: target.id } })).isPublished).toBe(false);
  });

  it('StaffNav : lien « Actualités » pour la bibliothèque seulement', async () => {
    const { StaffNav } = await import('@/components/staff/StaffNav');
    expect(html(StaffNav({ isAdmin: false, isLibraryStaff: true, verified: true }))).toContain('/personnel/actualites');
    expect(html(StaffNav({ isAdmin: false, isLibraryStaff: false, verified: true }))).not.toContain('/personnel/actualites');
  });
});

describe('règles du site', () => {
  it('validations : titre 3–150, contenu 10–10000, catégorie connue, champs inconnus refusés', async () => {
    as('librarian');
    for (const body of [
      valid({ title: 'ab' }),
      valid({ title: 'x'.repeat(151) }),
      valid({ content: 'court' }),
      valid({ content: 'x'.repeat(10_001) }),
      valid({ category: 'INCONNUE' }),
      valid({ source: 'SOFTWARE' }),
      valid({ publishedAt: '2020-01-01' }),
    ]) {
      expect((await create(body)).status).toBe(400);
    }
    expect((await create(valid({ title: 'abc', content: 'x'.repeat(10_000) }))).status).toBe(201);
  });

  it('création : origine SITE, auteur, brouillon sans date ; publication directe datée', async () => {
    as('librarian');
    const draft = await create(valid());
    const published = await create(valid({ isPublished: true }));

    expect(draft.status).toBe(201);
    expect(await prisma.news.findUniqueOrThrow({ where: { id: draft.body.data.id } })).toMatchObject({
      source: 'SITE',
      createdById: world.users.librarian.id,
      isPublished: false,
      publishedAt: null,
    });
    expect((await prisma.news.findUniqueOrThrow({ where: { id: published.body.data.id } })).publishedAt).toBeInstanceOf(Date);
  });

  it('publishedAt posé à la PREMIÈRE publication seulement (dépublier puis republier garde la date)', async () => {
    as('librarian');
    const { body } = await create(valid());
    const id = body.data.id as string;

    await patch(id, { isPublished: true });
    const first = (await prisma.news.findUniqueOrThrow({ where: { id } })).publishedAt;
    expect(first).toBeInstanceOf(Date);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((await patch(id, { isPublished: false })).body.message).toBe('Actualité dépubliée');
    expect((await prisma.news.findUniqueOrThrow({ where: { id } })).publishedAt).toEqual(first);
    await patch(id, { isPublished: true });
    await patch(id, { title: 'Titre modifié ensuite' });
    expect(await prisma.news.findUniqueOrThrow({ where: { id } })).toMatchObject({ publishedAt: first, isPublished: true, title: 'Titre modifié ensuite' });

    expect(nextPublishedAt(null, false)).toBeNull();
    expect(nextPublishedAt(first, false)).toEqual(first);
  });

  it('LIBRARIAN dépublie mais ne supprime pas ; ADMIN supprime', async () => {
    const news = await siteNews(true);

    as('librarian');
    expect((await patch(news.id, { isPublished: false })).status).toBe(200);
    expect(await remove(news.id)).toEqual({ status: 403, body: { success: false, message: NEWS_DELETE_ADMIN_ONLY } });
    expect(await prisma.news.count({ where: { id: news.id } })).toBe(1);

    as('admin');
    expect((await remove(news.id)).status).toBe(200);
    expect(await prisma.news.count({ where: { id: news.id } })).toBe(0);
    expect((await remove(news.id)).status).toBe(404);
  });

  it('actualité SOFTWARE intouchable depuis le site (403, aucune écriture), même par un ADMIN', async () => {
    const news = await softwareNews();

    for (const profile of ['librarian', 'admin'] as const) {
      as(profile);
      expect(await patch(news.id, { title: 'Pirate du site' })).toEqual({ status: 403, body: { success: false, message: SOFTWARE_NEWS_READ_ONLY } });
      expect((await patch(news.id, { isPublished: false })).status).toBe(403);
      expect((await remove(news.id)).status).toBe(403);
    }
    expect(await prisma.news.findUniqueOrThrow({ where: { id: news.id } })).toMatchObject({ title: news.title, isPublished: true });
    expect(evaluateNewsWrite(['ADMIN'], 'SOFTWARE', 'delete')).toMatchObject({ allowed: false });
  });

  it('identifiant inconnu : 404', async () => {
    as('admin');
    expect((await patch('inconnu', { title: 'Titre valide' })).status).toBe(404);
    expect((await remove('inconnu')).status).toBe(404);
  });

  it('texte brut : balises et script stockés tels quels, échappés à l’affichage, sauts de ligne conservés', async () => {
    const content = '<script>alert("x")</script>\n\n<b>gras</b> & <img src=x onerror=alert(1)>';
    as('librarian');
    const { body } = await create(valid({ title: '<i>Titre</i>', content, isPublished: true }));
    const id = body.data.id as string;

    expect((await prisma.news.findUniqueOrThrow({ where: { id } })).content).toBe(content);
    const api = await read(await apiNewsById(new NextRequest('http://localhost/api/news/x'), params({ id })));
    expect(api.body.data.content).toBe(content);

    const publicMarkup = html(await PublicNewsPage({ params: Promise.resolve({ id }) }));
    const staffMarkup = html(await EditStaffNewsPage({ params: Promise.resolve({ id }) }));
    for (const markup of [publicMarkup, staffMarkup]) {
      expect(markup).not.toContain('<script>alert');
      expect(markup).not.toContain('<b>gras</b>');
      expect(markup).not.toContain('<img src=x');
      expect(markup).not.toContain('<i>Titre</i>');
    }
    expect(publicMarkup).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(publicMarkup).toContain('whitespace-pre-line');
  });

  it('limitation de débit du personnel : 429 au-delà, sans écriture', async () => {
    const key = rateLimitKey('staff-news', world.users.admin.id);
    await prisma.rateLimitBucket.upsert({
      where: { key },
      create: { key, count: RATE_LIMITS.staffModeration.limit, windowStart: new Date() },
      update: { count: RATE_LIMITS.staffModeration.limit, windowStart: new Date() },
    });
    as('admin');
    const before = await prisma.news.count();

    expect((await create(valid())).status).toBe(429);
    expect(await prisma.news.count()).toBe(before);
    await prisma.rateLimitBucket.delete({ where: { key } });
  });

  it('journal : une action par opération, identifiant et champs, jamais le titre ni le contenu', async () => {
    as('admin');
    const title = `Titre secret ${unique()}`;
    const content = `Contenu secret ${unique()} assez long`;
    const { body } = await create({ title, content, category: 'GENERAL' });
    const id = body.data.id as string;
    await patch(id, { title: `${title} v2`, content: `${content} v2` });
    await patch(id, { isPublished: true });
    await patch(id, { isPublished: false });
    await remove(id);

    const logs = await prisma.activityLog.findMany({ where: { details: { path: ['newsId'], equals: id } }, orderBy: { createdAt: 'asc' } });
    expect(logs.map((log) => log.action)).toEqual(['news.site.create', 'news.site.update', 'news.site.publish', 'news.site.unpublish', 'news.site.delete']);
    expect(logs[1].details).toEqual({ newsId: id, fields: 'title,content' });
    for (const log of logs) {
      expect(JSON.stringify(log.details)).not.toContain('secret');
      expect(auditActionLabel(log.action)).not.toBe(log.action);
    }
    expect(summarizeAuditDetails(logs[1].details)).toEqual([
      { label: 'Actualité', value: id },
      { label: 'Champs modifiés', value: 'titre, contenu' },
    ]);
  });

  it('pages : SOFTWARE en lecture seule (badge, aucun bouton) ; SITE : boutons, suppression pour ADMIN seulement', async () => {
    const software = await softwareNews();
    const site = await siteNews(false);

    as('librarian');
    const list = html(await StaffNewsPage({ searchParams: Promise.resolve({ origine: 'logiciel' }) }));
    expect(list).toContain('Géré dans le logiciel');
    expect(list).toContain(software.title);
    expect(list).not.toContain(site.title);

    const softwarePage = html(await EditStaffNewsPage({ params: Promise.resolve({ id: software.id }) }));
    expect(softwarePage).toContain('Géré dans le logiciel');
    for (const label of ['Dépublier', 'Publier', 'Supprimer', 'Enregistrer']) expect(softwarePage).not.toContain(`>${label}<`);

    const librarianSite = html(await EditStaffNewsPage({ params: Promise.resolve({ id: site.id }) }));
    expect(librarianSite).toContain('>Publier<');
    expect(librarianSite).not.toContain('>Supprimer<');

    as('admin');
    expect(html(await EditStaffNewsPage({ params: Promise.resolve({ id: site.id }) }))).toContain('>Supprimer<');
  });

  it('liste : filtres état et catégorie, pagination par l’URL', async () => {
    const draft = await siteNews(false, { category: 'CONFERENCE' });
    as('admin');

    const drafts = html(await StaffNewsPage({ searchParams: Promise.resolve({ etat: 'brouillon', categorie: 'CONFERENCE' }) }));
    expect(drafts).toContain(draft.title);
    expect(html(await StaffNewsPage({ searchParams: Promise.resolve({ etat: 'publiee' }) }))).not.toContain(draft.title);
    expect(html(await StaffNewsPage({ searchParams: Promise.resolve({ etat: 'n-importe', page: 'abc' }) }))).toContain('Actualités');
  });
});

describe('webhook news/sync', () => {
  it('CREATE : origine SOFTWARE ; réponse inchangée (mêmes champs qu’avant)', async () => {
    const response = await read(await sync({ action: 'CREATE', news: { title: 'Du logiciel', content: 'Texte', category: 'EVENT' } }));
    createdNews.push(response.body.data.id);

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Actualité synchronisée');
    expect(Object.keys(response.body.data).sort()).toEqual(['category', 'content', 'createdAt', 'id', 'image', 'isPublished', 'publishedAt', 'title']);
    expect((await prisma.news.findUniqueOrThrow({ where: { id: response.body.data.id } })).source).toBe('SOFTWARE');
  });

  it('CREATE avec id inconnu : créé avec cet id ; avec id SOFTWARE existant : remplacé (comme avant)', async () => {
    const id = `sw-${unique()}`;
    createdNews.push(id);
    expect((await sync({ action: 'CREATE', news: { id, title: 'Premier', content: 'A' } })).status).toBe(200);
    expect((await sync({ action: 'CREATE', news: { id, title: 'Second', content: 'B' } })).status).toBe(200);
    expect(await prisma.news.findUniqueOrThrow({ where: { id } })).toMatchObject({ title: 'Second', content: 'B', source: 'SOFTWARE' });
  });

  it('CREATE, UPDATE et DELETE d’une actualité SITE : 409 « Actualité gérée sur le site », aucune écriture', async () => {
    const news = await siteNews(true);
    const before = await prisma.news.findUniqueOrThrow({ where: { id: news.id } });
    const logsBefore = await prisma.activityLog.count({ where: { action: { startsWith: 'news.sync.' } } });

    for (const action of ['CREATE', 'UPDATE', 'DELETE']) {
      expect(await read(await sync({ action, news: { id: news.id, title: 'Écrasé', content: 'Écrasé', isPublished: false } }))).toEqual({
        status: 409,
        body: { success: false, message: 'Actualité gérée sur le site' },
      });
    }
    expect(await prisma.news.findUniqueOrThrow({ where: { id: news.id } })).toEqual(before);
    expect(await prisma.activityLog.count({ where: { action: { startsWith: 'news.sync.' } } })).toBe(logsBefore);
  });

  it('UPDATE partiel : les champs absents sont conservés, publishedAt compris', async () => {
    const publishedAt = new Date('2026-01-15T10:00:00.000Z');
    const news = await softwareNews({ image: 'https://exemple.org/a.png', category: 'CONFERENCE', publishedAt, isPublished: true });

    const response = await read(await sync({ action: 'UPDATE', news: { id: news.id, title: 'Nouveau titre' } }));
    expect(response.status).toBe(200);
    expect(await prisma.news.findUniqueOrThrow({ where: { id: news.id } })).toMatchObject({
      title: 'Nouveau titre',
      content: news.content,
      image: 'https://exemple.org/a.png',
      category: 'CONFERENCE',
      isPublished: true,
      publishedAt,
    });

    await sync({ action: 'UPDATE', news: { id: news.id, image: '', isPublished: false, publishedAt: '2026-02-01T00:00:00.000Z' } });
    expect(await prisma.news.findUniqueOrThrow({ where: { id: news.id } })).toMatchObject({
      image: null,
      isPublished: false,
      publishedAt: new Date('2026-02-01T00:00:00.000Z'),
      title: 'Nouveau titre',
    });
  });

  it('identifiant inconnu : DELETE et UPDATE → 404 (au lieu de 500) ; id manquant → 400 comme avant', async () => {
    expect(await read(await sync({ action: 'DELETE', news: { id: `inconnu-${unique()}` } }))).toEqual({ status: 404, body: { success: false, message: 'Actualité introuvable' } });
    expect((await sync({ action: 'UPDATE', news: { id: `inconnu-${unique()}`, title: 'x' } })).status).toBe(404);
    expect((await sync({ action: 'DELETE', news: {} })).status).toBe(400);
    expect((await sync({ action: 'UPDATE', news: { title: 'x' } })).status).toBe(400);
  });

  it('DELETE d’une actualité SOFTWARE : réponse inchangée', async () => {
    const news = await softwareNews();
    expect(await read(await sync({ action: 'DELETE', news: { id: news.id } }))).toEqual({ status: 200, body: { success: true, message: 'Actualité supprimée' } });
    expect(await prisma.news.count({ where: { id: news.id } })).toBe(0);
  });

  it('clé absente ou invalide : 401 ; non configurée : 500 (comme avant)', async () => {
    expect((await sync({ action: 'DELETE', news: { id: 'x' } }, null)).status).toBe(401);
    expect((await sync({ action: 'DELETE', news: { id: 'x' } }, 'mauvaise')).status).toBe(401);
    delete process.env.GEST_BIBLIO_API_KEY;
    expect((await sync({ action: 'DELETE', news: { id: 'x' } })).status).toBe(500);
    process.env.GEST_BIBLIO_API_KEY = KEY;
  });
});

describe('lecture publique : aucune fuite des brouillons', () => {
  let draft: { id: string; title: string };
  let unpublished: { id: string; title: string };
  let softwareDraft: { id: string; title: string };
  let published: { id: string; title: string };

  beforeAll(async () => {
    draft = await siteNews(false);
    unpublished = await siteNews(false, { publishedAt: new Date(Date.now() - 1000) });
    softwareDraft = await softwareNews({ isPublished: false });
    published = await siteNews(true, { publishedAt: new Date(Date.now() + 60_000) });
  });

  it('accueil et /actualites : publiée présente, brouillons et dépubliées absents', async () => {
    as(null);
    const home = html(await HomePage());
    const list = html(await PublicNewsList({ searchParams: Promise.resolve({}) }));

    for (const markup of [home, list]) {
      expect(markup).toContain(published.title);
      for (const hidden of [draft, unpublished, softwareDraft]) expect(markup).not.toContain(hidden.title);
    }
  });

  it('/actualites/[id] : brouillon et dépubliée → « Actualité non trouvée »', async () => {
    for (const hidden of [draft, unpublished, softwareDraft]) {
      const markup = html(await PublicNewsPage({ params: Promise.resolve({ id: hidden.id }) }));
      expect(markup).toContain('Actualité non trouvée');
      expect(markup).not.toContain(hidden.title);
    }
    expect(html(await PublicNewsPage({ params: Promise.resolve({ id: published.id }) }))).toContain(published.title);
  });

  it('/api/news/[id] : brouillon et dépubliée → 404 comme un identifiant inconnu ; /api/news : publiées seulement', async () => {
    const get = async (id: string) => read(await apiNewsById(new NextRequest(`http://localhost/api/news/${id}`), params({ id })));
    const unknown = await get('inconnu');

    for (const hidden of [draft, unpublished, softwareDraft]) expect(await get(hidden.id)).toEqual(unknown);
    expect(unknown.status).toBe(404);
    const ok = await get(published.id);
    expect(ok.status).toBe(200);
    expect(Object.keys(ok.body.data)).not.toContain('createdById');

    const list = await read(await apiNewsList(new NextRequest('http://localhost/api/news?limit=50')));
    const ids = (list.body.data.data as Array<{ id: string }>).map((item) => item.id);
    expect(ids).toContain(published.id);
    for (const hidden of [draft, unpublished, softwareDraft]) expect(ids).not.toContain(hidden.id);
  });
});
