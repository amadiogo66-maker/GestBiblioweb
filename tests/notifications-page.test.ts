import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement, type ReactElement } from 'react';
import { prisma } from './helpers/local-db';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => '/notifications',
}));

const { auth } = await import('@/lib/auth');
const { default: NotificationsPage } = await import('@/app/(dashboard)/notifications/page');
const { default: DashboardPage } = await import('@/app/(dashboard)/tableau-de-bord/page');
const { DashboardNav } = await import('@/components/dashboard/DashboardNav');
const { listUserNotifications } = await import('@/lib/notifications-data');
const { middleware } = await import('@/middleware');
const { GET: listRoute, PATCH: patchAllRoute } = await import('@/app/api/notifications/route');
const { PATCH: readRoute } = await import('@/app/api/notifications/[id]/read/route');
const { PATCH: readAllRoute } = await import('@/app/api/notifications/read-all/route');
const { GET: countRoute } = await import('@/app/api/notifications/count/route');
const { GET: unreadCountRoute } = await import('@/app/api/notifications/unread-count/route');

const suffix = randomUUID().slice(0, 8);
const PREFIX = `TEST-NPAGE-${suffix}`;
const startedAt = new Date();
const authMock = vi.mocked(auth as unknown as (...args: unknown[]) => Promise<unknown>);
const userIds: string[] = [];
let counter = 0;

async function createUser(): Promise<string> {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: `test-npage-${counter}-${suffix}@test.local`,
      username: `test_npage_${counter}_${suffix}`,
      password: 'x',
      firstName: 'Lecteur',
      lastName: 'Test',
      status: 'ACTIVE',
    },
  });
  userIds.push(user.id);
  return user.id;
}

function addNotification(userId: string, overrides: Record<string, unknown> = {}) {
  counter += 1;
  return prisma.notification.create({
    data: { userId, type: 'GENERAL', title: `${PREFIX} titre ${counter}`, message: 'Message de test', dedupeKey: `${PREFIX}-${counter}`, ...overrides },
  });
}

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id, status: 'ACTIVE', firstName: 'Lecteur' }, expires: '2099-01-01' } : null);
const render = async (params: Record<string, string> = {}) =>
  renderToStaticMarkup((await NotificationsPage({ searchParams: Promise.resolve(params) })) as ReactElement);
const patch = () =>
  new NextRequest('http://localhost/api/notifications', { method: 'PATCH', headers: { host: 'localhost', origin: 'http://localhost' } });
const readParams = (id: string) => ({ params: Promise.resolve({ id }) });
const isRead = async (id: string) => (await prisma.notification.findUniqueOrThrow({ where: { id } })).isRead;

let owner = '';
let stranger = '';

beforeAll(async () => {
  owner = await createUser();
  stranger = await createUser();
});

beforeEach(() => {
  authMock.mockReset();
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.activityLog.deleteMany({ where: { userId: { in: userIds }, createdAt: { gte: startedAt } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe('accès à /notifications', () => {
  it('non connecté : la page redirige vers /connexion', async () => {
    as(null);
    await expect(NotificationsPage({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({
      digest: expect.stringContaining('/connexion'),
    });
  });

  it('non connecté : le middleware redirige la page et répond 401 sur l’API', async () => {
    as(null);
    const page = await middleware(new NextRequest('http://localhost/notifications?filter=unread'));
    const api = await middleware(new NextRequest('http://localhost/api/notifications'));

    expect(page.status).toBe(307);
    expect(page.headers.get('location')).toContain('/connexion');
    expect(api.status).toBe(401);
  });

  it.each([
    ['SUSPENDED', '/compte-bloque'],
    ['BANNED', '/compte-bloque'],
    ['PENDING', '/en-attente-validation'],
  ] as const)('compte %s : redirection vers %s avant toute lecture', async (status, target) => {
    const user = await createUser();
    await addNotification(user);
    await prisma.user.update({ where: { id: user }, data: { status } });
    as(user);
    const findMany = vi.spyOn(prisma.notification, 'findMany');

    await expect(NotificationsPage({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({
      digest: expect.stringContaining(target),
    });
    expect(findMany).not.toHaveBeenCalled();
    findMany.mockRestore();
  });

  it('un autre utilisateur ne voit ni ne compte ces notifications', async () => {
    const user = await createUser();
    const other = await createUser();
    const mine = await addNotification(user, { title: `${PREFIX} visible` });
    const hidden = await addNotification(other, { title: `${PREFIX} privee`, message: 'Message privé' });

    as(user);
    const html = await render();
    const list = await (await listRoute()).json();
    expect(html).toContain(mine.title);
    expect(html).not.toContain(hidden.title);
    expect(html).not.toContain('Message privé');
    expect(list.data.map((row: { id: string }) => row.id)).toEqual([mine.id]);
    expect((await (await countRoute()).json()).data.unreadCount).toBe(1);
    expect((await (await unreadCountRoute()).json()).data.unreadCount).toBe(1);
  });

  it('marquer comme lue la notification d’un autre : 404, aucune modification, aucun journal', async () => {
    const target = await addNotification(stranger);
    const logsBefore = await prisma.activityLog.count({ where: { userId: owner, action: 'notification.read' } });
    as(owner);

    const response = await readRoute(patch(), readParams(target.id));

    expect(response.status).toBe(404);
    expect(await isRead(target.id)).toBe(false);
    expect(await prisma.activityLog.count({ where: { userId: owner, action: 'notification.read' } })).toBe(logsBefore);
  });

  it.each([
    ['PATCH /api/notifications/read-all', () => readAllRoute(patch())],
    ['PATCH /api/notifications', () => patchAllRoute(patch())],
  ])('%s ne touche pas les notifications d’un autre', async (_name, call) => {
    const user = await createUser();
    const other = await createUser();
    const mine = await addNotification(user);
    const theirs = await addNotification(other);
    as(user);

    expect((await call()).status).toBe(200);
    expect(await isRead(mine.id)).toBe(true);
    expect(await isRead(theirs.id)).toBe(false);
  });

  it('routes de lecture et de marquage sans session : 401', async () => {
    const target = await addNotification(stranger);
    as(null);

    expect((await listRoute()).status).toBe(401);
    expect((await readRoute(patch(), readParams(target.id))).status).toBe(401);
    expect((await readAllRoute(patch())).status).toBe(401);
    expect(await isRead(target.id)).toBe(false);
  });
});

describe('liste, filtre et pagination', () => {
  let user = '';
  const base = Date.now() - 60 * 60_000;

  beforeAll(async () => {
    user = await createUser();
    for (let index = 0; index < 25; index += 1) {
      await addNotification(user, {
        title: `${PREFIX} rang ${String(index).padStart(2, '0')}.`,
        createdAt: new Date(base + index * 1000),
        isRead: index % 5 === 0,
      });
    }
  });

  it('20 par page, les plus récentes d’abord, seconde page complète', async () => {
    const first = await listUserNotifications(user, { page: 1, filter: 'all' });
    const second = await listUserNotifications(user, { page: 2, filter: 'all' });

    expect(first).toMatchObject({ page: 1, total: 25, totalPages: 2, unreadCount: 20 });
    expect(first.notifications).toHaveLength(20);
    expect(first.notifications[0].title).toContain('rang 24.');
    expect(second.notifications).toHaveLength(5);
    expect(second.notifications[4].title).toContain('rang 00.');
    expect(new Set([...first.notifications, ...second.notifications].map((row) => row.id)).size).toBe(25);
  });

  it('filtre Non lues', async () => {
    const unread = await listUserNotifications(user, { page: 1, filter: 'unread' });

    expect(unread.total).toBe(20);
    expect(unread.notifications.every((row) => !row.isRead)).toBe(true);
  });

  it('URL : page, filtre, valeurs invalides et page trop grande', async () => {
    as(user);
    const page2 = await render({ page: '2' });
    expect(page2).toContain('rang 00.');
    expect(page2).not.toContain('rang 24.');
    expect(page2).toContain('Page 2 sur 2');

    const unread = await render({ filter: 'unread' });
    expect(unread).not.toContain('rang 20.');
    expect(unread).toContain('rang 24.');
    // 20 résultats tiennent sur une page : la pagination n'est pas affichée.
    expect(unread).not.toContain('Page 2');

    const invalid = await render({ filter: 'pirate', page: 'abc' });
    expect(invalid).toContain('rang 24.');
    expect(invalid).toContain('Page 1 sur 2');

    expect(await render({ page: '999' })).toContain('Page 2 sur 2');
  });

  it('chaque élément montre type, état, date relative et date complète', async () => {
    as(user);
    const html = await render();

    expect(html).toContain('Information');
    expect(html).toContain('Non lue');
    expect(html).toContain('>Lue<');
    expect(html).toMatch(/il y a/);
    expect(html).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(html).toContain('Tout marquer comme lu');
    expect(html).toContain('Marquer comme lue');
  });
});

describe('actions et affichage', () => {
  it('marquer comme lue : effectif et idempotent', async () => {
    const user = await createUser();
    const item = await addNotification(user);
    as(user);

    expect((await readRoute(patch(), readParams(item.id))).status).toBe(200);
    expect(await isRead(item.id)).toBe(true);
    expect((await readRoute(patch(), readParams(item.id))).status).toBe(200);
    expect(await prisma.activityLog.count({ where: { userId: user, action: 'notification.read' } })).toBe(1);
  });

  it('tout lire : compteur à zéro, bouton retiré, état « à jour »', async () => {
    const user = await createUser();
    await addNotification(user);
    await addNotification(user);
    as(user);

    const body = await (await readAllRoute(patch())).json();
    const html = await render();

    expect(body.data.count).toBe(2);
    expect(html).toContain('Vous êtes à jour.');
    expect(html).not.toContain('Tout marquer comme lu');
    expect(html).not.toContain('Marquer comme lue');
  });

  it('texte seulement : le HTML du titre et du message n’est jamais interprété', async () => {
    const user = await createUser();
    await addNotification(user, {
      title: '<img src=x onerror=alert(1)>',
      message: '<script>alert("xss")</script><b>gras</b>',
    });
    as(user);
    const html = await render();

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>gras');
    expect(html).toContain('&lt;script&gt;');
  });

  it('état vide : Toutes et Non lues', async () => {
    const user = await createUser();
    as(user);

    expect(await render()).toContain('Aucune notification pour le moment.');
    expect(await render({ filter: 'unread' })).toContain('Aucune notification non lue.');
  });

  it('la navigation et le compteur du tableau de bord mènent à /notifications', async () => {
    const user = await createUser();
    as(user);

    expect(renderToStaticMarkup(createElement(DashboardNav))).toContain('href="/notifications"');
    expect(renderToStaticMarkup((await DashboardPage()) as ReactElement)).toContain('href="/notifications"');
  });
});
