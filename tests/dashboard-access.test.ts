import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { prisma } from './helpers/local-db';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => '/tableau-de-bord',
}));

const { auth } = await import('@/lib/auth');
const { getActiveSessionUserId, requireActiveDashboardUser } = await import('@/lib/dashboard-access');
const { default: TableauDeBord } = await import('@/app/(dashboard)/tableau-de-bord/page');
const { default: Emprunts } = await import('@/app/(dashboard)/emprunts/page');
const { default: Reservations } = await import('@/app/(dashboard)/reservations/page');
const { default: Profil } = await import('@/app/(dashboard)/profil/page');
const { default: Notifications } = await import('@/app/(dashboard)/notifications/page');
const { default: Layout } = await import('@/app/(dashboard)/layout');

const suffix = randomUUID().slice(0, 8);
const authMock = vi.mocked(auth as unknown as (...args: unknown[]) => Promise<unknown>);
const ids: Record<string, string> = {};

const PAGES: Array<[string, () => Promise<unknown>]> = [
  ['tableau-de-bord', () => TableauDeBord()],
  ['emprunts', () => Emprunts({ searchParams: Promise.resolve({}) })],
  ['reservations', () => Reservations()],
  ['profil', () => Profil()],
  ['notifications', () => Notifications({ searchParams: Promise.resolve({}) })],
];

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id, status: 'ACTIVE', firstName: 'JwtPrenom' }, expires: '2099-01-01' } : null);

beforeAll(async () => {
  for (const status of ['ACTIVE', 'SUSPENDED', 'BANNED', 'PENDING'] as const) {
    const user = await prisma.user.create({
      data: {
        email: `test-access-${status.toLowerCase()}-${suffix}@test.local`,
        username: `test_access_${status.toLowerCase()}_${suffix}`,
        password: 'x',
        firstName: 'Base',
        lastName: 'Test',
        status,
      },
    });
    ids[status] = user.id;
  }
});

beforeEach(() => {
  authMock.mockReset();
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
});

describe('requireActiveDashboardUser', () => {
  it('compte actif : identité renvoyée', async () => {
    as(ids.ACTIVE);

    // Rôle et département relus en base (le JWT n'en dit rien ici).
    await expect(requireActiveDashboardUser()).resolves.toEqual({
      id: ids.ACTIVE,
      firstName: 'JwtPrenom',
      hasStaffAccess: false,
      role: 'STUDENT',
      departmentId: null,
    });
  });

  it('sans session : /connexion', async () => {
    as(null);

    await expect(requireActiveDashboardUser()).rejects.toMatchObject({ digest: expect.stringContaining('/connexion') });
  });

  it.each([
    ['SUSPENDED', '/compte-bloque'],
    ['BANNED', '/compte-bloque'],
    ['PENDING', '/en-attente-validation'],
  ])('compte %s : %s', async (status, target) => {
    as(ids[status]);

    await expect(requireActiveDashboardUser()).rejects.toMatchObject({ digest: expect.stringContaining(target) });
  });

  it('compte supprimé avec JWT encore valide : /compte-bloque', async () => {
    as('compte-supprime');

    await expect(requireActiveDashboardUser()).rejects.toMatchObject({ digest: expect.stringContaining('/compte-bloque') });
  });

  it('page publique : identifiant seulement pour un compte actif', async () => {
    as(ids.ACTIVE);
    expect(await getActiveSessionUserId()).toBe(ids.ACTIVE);

    for (const id of [ids.SUSPENDED, ids.BANNED, ids.PENDING, 'compte-supprime', null]) {
      as(id);
      expect(await getActiveSessionUserId()).toBeNull();
    }
  });
});

describe('aucune lecture de données avant le garde', () => {
  function spyOnDataReads() {
    const spies = [
      vi.spyOn(prisma.loan, 'findMany'),
      vi.spyOn(prisma.loan, 'count'),
      vi.spyOn(prisma.reservation, 'findMany'),
      vi.spyOn(prisma.reservation, 'count'),
      vi.spyOn(prisma.notification, 'findMany'),
      vi.spyOn(prisma.notification, 'count'),
      vi.spyOn(prisma.user, 'findUniqueOrThrow'),
      vi.spyOn(prisma.siteSetting, 'findUnique'),
      vi.spyOn(prisma, '$executeRaw'),
    ];

    return { total: () => spies.reduce((sum, spy) => sum + spy.mock.calls.length, 0), restore: () => spies.forEach((spy) => spy.mockRestore()) };
  }

  it('les espions voient bien une lecture réelle (contrôle du test)', async () => {
    const spies = spyOnDataReads();

    await prisma.loan.count({ where: { userId: ids.ACTIVE } });
    expect(spies.total()).toBe(1);
    spies.restore();
  });

  describe.each(['SUSPENDED', 'BANNED', 'PENDING', 'SUPPRIME'])('compte %s', (status) => {
    it.each(PAGES)('%s : redirection sans aucune lecture', async (_name, render) => {
      as(status === 'SUPPRIME' ? 'compte-supprime' : ids[status]);
      const spies = spyOnDataReads();

      await expect(render()).rejects.toMatchObject({ digest: expect.stringContaining('NEXT_REDIRECT') });
      expect(spies.total()).toBe(0);
      spies.restore();
    });
  });
});

describe('accès normal', () => {
  it.each(PAGES)('%s : compte actif, rendu sans erreur', async (_name, render) => {
    as(ids.ACTIVE);

    expect(renderToStaticMarkup((await render()) as ReactElement).length).toBeGreaterThan(100);
  });

  it('layout : prénom de la session et lien personnel absent sans affectation', async () => {
    as(ids.ACTIVE);
    const html = renderToStaticMarkup((await Layout({ children: null })) as ReactElement);

    expect(html).toContain('JwtPrenom');
    expect(html).not.toContain('Espace du personnel');
  });

  it('layout : lien personnel présent avec une affectation active', async () => {
    await prisma.staffAssignment.create({ data: { userId: ids.ACTIVE, role: 'LIBRARIAN' } });
    as(ids.ACTIVE);
    const html = renderToStaticMarkup((await Layout({ children: null })) as ReactElement);
    await prisma.staffAssignment.deleteMany({ where: { userId: ids.ACTIVE } });

    expect(html).toContain('Espace du personnel');
  });
});
