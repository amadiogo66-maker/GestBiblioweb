import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { prisma } from './helpers/local-db';

// Session simulée : seule la source de l'identifiant ; l'autorisation relit la base.
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
// Le composant client de modération utilise le routeur : neutralisé pour le rendu serveur.
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
}));

const { auth } = await import('@/lib/auth');
const { PATCH } = await import('@/app/api/staff/accounts/[id]/status/route');
const { POST: membersSync } = await import('@/app/api/members/sync/route');
const { default: StaffLayout } = await import('@/app/(staff)/personnel/layout');
const { default: DashboardPage } = await import('@/app/(staff)/personnel/page');
const { default: AccountsPage } = await import('@/app/(staff)/personnel/comptes/page');
const { default: AccountDetailPage } = await import('@/app/(staff)/personnel/comptes/[id]/page');
const { default: JournalPage } = await import('@/app/(staff)/personnel/journal/page');
const { rateLimitKey } = await import('@/lib/rate-limit');
const { loadStaffPageContext } = await import('@/lib/staff-page');

const suffix = randomUUID().slice(0, 8);
const startedAt = new Date();
const FAKE_HASH = `$2b$12$FIXTUREHASH${suffix}`;
const FAKE_QR = `data:image/png;base64,FIXTUREQR${suffix}`;
const apiKey = `test-staff-key-${suffix}`;
const originalKey = process.env.GEST_BIBLIO_API_KEY;
const ids: Record<string, string> = {};
const authMock = vi.mocked(auth as unknown as (...args: unknown[]) => Promise<unknown>);

type Status = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'BANNED';

async function createAccount(
  key: string,
  status: Status,
  options: { staff?: 'ADMIN' | 'LIBRARIAN'; revoked?: boolean; member?: { inscriptionActive: boolean; dateExpiration?: Date }; autoSuspended?: boolean } = {}
): Promise<void> {
  const matricule = options.member ? `STF-${key}-${suffix}` : null;
  if (options.member && matricule) {
    await prisma.libraryMember.create({
      data: { matricule, nom: key, prenom: 'Test', dateNaissance: new Date('2000-01-01'), ...options.member },
    });
  }
  const user = await prisma.user.create({
    data: {
      email: `stf-${key.toLowerCase()}-${suffix}@test.local`,
      username: `stf_${key.toLowerCase()}_${suffix}`,
      password: FAKE_HASH,
      qrCode: FAKE_QR,
      firstName: key,
      lastName: 'Test',
      status,
      matricule,
      autoSuspendedAt: options.autoSuspended ? new Date() : null,
    },
  });
  ids[key] = user.id;
  if (options.staff) {
    await prisma.staffAssignment.create({
      data: { userId: user.id, role: options.staff, revokedAt: options.revoked ? new Date() : null },
    });
  }
}

/** Session de l'utilisateur `key` (null : non connecté). `claims` simule un JWT trompeur. */
function as(key: string | null, claims: Record<string, unknown> = {}): void {
  authMock.mockResolvedValue(key ? { user: { id: ids[key], status: 'ACTIVE', ...claims }, expires: '2099-01-01' } : null);
}

async function moderate(targetKey: string, body: unknown, origin: string | null = 'http://localhost') {
  const headers: Record<string, string> = { host: 'localhost', 'content-type': 'application/json' };
  if (origin) headers.origin = origin;
  const response = await PATCH(new NextRequest(`http://localhost/api/staff/accounts/${ids[targetKey]}/status`, { method: 'PATCH', headers, body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: ids[targetKey] }),
  });
  return { status: response.status, body: await response.json(), headers: response.headers };
}

const reason = 'Motif de test suffisant';
const staffLogs = (targetKey: string) =>
  prisma.activityLog.findMany({ where: { action: { startsWith: 'staff.account.' }, details: { path: ['targetUserId'], equals: ids[targetKey] } } });
const statusOf = async (key: string) => prisma.user.findUniqueOrThrow({ where: { id: ids[key] }, select: { status: true, autoSuspendedAt: true } });

async function expectNotFound(promise: Promise<unknown>): Promise<void> {
  await expect(promise).rejects.toMatchObject({ digest: expect.stringContaining('404') });
}

beforeAll(async () => {
  process.env.GEST_BIBLIO_API_KEY = apiKey;
  await createAccount('ADMIN', 'ACTIVE', { staff: 'ADMIN' });
  await createAccount('LIB', 'ACTIVE', { staff: 'LIBRARIAN' });
  await createAccount('STUDENT', 'ACTIVE', { member: { inscriptionActive: true } });
  await createAccount('REVOKED', 'ACTIVE', { staff: 'ADMIN', revoked: true });
  await createAccount('STAFFSUSP', 'SUSPENDED', { staff: 'ADMIN' });
  await createAccount('TARGET', 'ACTIVE', { member: { inscriptionActive: true } });
  await createAccount('INACTIVE', 'SUSPENDED', { member: { inscriptionActive: false }, autoSuspended: true });
  await createAccount('EXPIRED', 'SUSPENDED', { member: { inscriptionActive: true, dateExpiration: new Date('2025-01-01') } });
  await createAccount('BANNED', 'BANNED', { member: { inscriptionActive: true } });
  await createAccount('PENDING', 'PENDING');
  await createAccount('STAFFTARGET', 'ACTIVE', { staff: 'LIBRARIAN' });
  await createAccount('MANUAL', 'ACTIVE', { member: { inscriptionActive: true } });
  await createAccount('RATE', 'ACTIVE');
});

beforeEach(() => authMock.mockReset());

afterAll(async () => {
  if (originalKey === undefined) delete process.env.GEST_BIBLIO_API_KEY;
  else process.env.GEST_BIBLIO_API_KEY = originalKey;
  const userIds = Object.values(ids);
  await prisma.activityLog.deleteMany({
    where: { createdAt: { gte: startedAt }, OR: [{ action: { startsWith: 'staff.account.' } }, { action: 'members.sync' }] },
  });
  await prisma.staffAssignment.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.libraryMember.deleteMany({ where: { matricule: { contains: suffix } } });
  await prisma.rateLimitBucket.deleteMany({ where: { windowStart: { gte: new Date(startedAt.getTime() - 1000) } } });
});

describe('matrice d’accès — pages', () => {
  it.each([
    ['non connecté', null, {}],
    ['STUDENT', 'STUDENT', {}],
    ['affectation révoquée', 'REVOKED', {}],
    ['personnel suspendu', 'STAFFSUSP', {}],
    ['JWT prétendant ADMIN sans affectation', 'STUDENT', { role: 'ADMIN', staffRoles: ['ADMIN'] }],
  ] as const)('%s : notFound() sur le layout et le journal', async (_label, key, claims) => {
    as(key, claims);
    await expectNotFound(StaffLayout({ children: null }));
    await expectNotFound(JournalPage({ searchParams: Promise.resolve({}) }));
  });

  it('LIBRARIAN : layout, tableau de bord, comptes OK ; journal → notFound()', async () => {
    as('LIB');
    const layout = renderToStaticMarkup((await StaffLayout({ children: null })) as ReactElement);
    expect(layout).toContain('Bibliothécaire');
    expect(layout).not.toContain('/personnel/journal');
    renderToStaticMarkup((await DashboardPage()) as ReactElement);
    renderToStaticMarkup((await AccountsPage({ searchParams: Promise.resolve({ q: 'stf' }) })) as ReactElement);
    await expectNotFound(JournalPage({ searchParams: Promise.resolve({}) }));
  });

  it('ADMIN : journal accessible, lien Journal visible ; identifiant inconnu → notFound()', async () => {
    as('ADMIN');
    expect(renderToStaticMarkup((await StaffLayout({ children: null })) as ReactElement)).toContain('/personnel/journal');
    expect(renderToStaticMarkup((await JournalPage({ searchParams: Promise.resolve({}) })) as ReactElement)).toContain('Journal');
    await expectNotFound(AccountDetailPage({ params: Promise.resolve({ id: 'inexistant' }) }));
  });

  it('le contexte des pages ne charge que des champs sûrs (jamais le mot de passe)', async () => {
    as('ADMIN');
    const context = await loadStaffPageContext();

    expect(context && Object.keys(context.user).sort()).toEqual(['email', 'firstName', 'id', 'lastName']);
    expect(JSON.stringify(context)).not.toMatch(/FIXTURE|password|qrCode/);
  });

  it('aucune donnée sensible dans les pages (password, qrCode)', async () => {
    as('ADMIN');
    const pages = [
      await DashboardPage(),
      await AccountsPage({ searchParams: Promise.resolve({ q: suffix }) }),
      await AccountDetailPage({ params: Promise.resolve({ id: ids.TARGET }) }),
      await JournalPage({ searchParams: Promise.resolve({}) }),
    ].map((element) => renderToStaticMarkup(element as ReactElement));

    expect(pages[1]).toContain(`stf-target-${suffix}@test.local`);
    for (const html of pages) {
      expect(html).not.toContain(FAKE_HASH);
      expect(html).not.toContain('FIXTUREQR');
    }
  });
});

describe('matrice d’accès — API PATCH /api/staff/accounts/[id]/status', () => {
  it.each([
    ['non connecté', 401, null, {}],
    ['STUDENT', 403, 'STUDENT', {}],
    ['affectation révoquée', 403, 'REVOKED', {}],
    ['personnel suspendu', 401, 'STAFFSUSP', {}],
    ['JWT prétendant ADMIN sans affectation', 403, 'STUDENT', { role: 'ADMIN', staffRoles: ['ADMIN'] }],
  ] as const)('%s → %s, aucune écriture', async (_label, expected, key, claims) => {
    as(key, claims);
    const { status } = await moderate('TARGET', { action: 'suspend', reason });

    expect(status).toBe(expected);
    expect((await statusOf('TARGET')).status).toBe('ACTIVE');
    expect(await staffLogs('TARGET')).toHaveLength(0);
  });

  it('Origin absent ou d’un autre hôte → 403, même pour un ADMIN', async () => {
    as('ADMIN');
    expect((await moderate('TARGET', { action: 'suspend', reason }, null)).status).toBe(403);
    expect((await moderate('TARGET', { action: 'suspend', reason }, 'https://evil.example')).status).toBe(403);
    expect((await statusOf('TARGET')).status).toBe('ACTIVE');
  });

  it('corps invalide (motif trop court) → 400', async () => {
    as('ADMIN');
    expect((await moderate('TARGET', { action: 'suspend', reason: 'non' })).status).toBe(400);
  });

  it('LIBRARIAN suspend puis réactive : 200, une entrée de journal par action, réponse sans donnée sensible', async () => {
    as('LIB');
    const suspended = await moderate('TARGET', { action: 'suspend', reason });

    expect(suspended.status).toBe(200);
    expect(suspended.body).toEqual({ success: true, message: 'Compte suspendu.', data: { id: ids.TARGET, status: 'SUSPENDED' } });
    expect(JSON.stringify(suspended.body)).not.toMatch(/password|qrCode|FIXTURE/);
    expect(await statusOf('TARGET')).toEqual({ status: 'SUSPENDED', autoSuspendedAt: null });

    const reactivated = await moderate('TARGET', { action: 'reactivate', reason: 'Situation régularisée' });
    expect(reactivated.status).toBe(200);
    expect((await statusOf('TARGET')).status).toBe('ACTIVE');

    const logs = await staffLogs('TARGET');
    expect(logs.map((log) => log.action).sort()).toEqual(['staff.account.reactivate', 'staff.account.suspend']);
    for (const log of logs) expect(log.userId).toBe(ids.LIB);
    expect(logs.find((log) => log.action === 'staff.account.suspend')!.details).toEqual({
      targetUserId: ids.TARGET,
      statusBefore: 'ACTIVE',
      statusAfter: 'SUSPENDED',
      reason,
    });
  });
});

describe('règles de modération (base locale)', () => {
  it('auto-modération et compte du personnel → 403', async () => {
    as('ADMIN');
    expect((await moderate('ADMIN', { action: 'suspend', reason })).status).toBe(403);
    expect((await moderate('STAFFTARGET', { action: 'suspend', reason })).status).toBe(403);
    expect((await statusOf('STAFFTARGET')).status).toBe('ACTIVE');
  });

  it('LIBRARIAN ne peut pas bannir (403) ; ADMIN peut', async () => {
    as('LIB');
    expect((await moderate('STUDENT', { action: 'ban', reason })).status).toBe(403);
    expect((await statusOf('STUDENT')).status).toBe('ACTIVE');
  });

  it('réactivation refusée (409) si l’inscription est inactive ou expirée', async () => {
    as('ADMIN');
    const inactive = await moderate('INACTIVE', { action: 'reactivate', reason });
    expect(inactive.status).toBe(409);
    expect(inactive.body.message).toMatch(/inscription/i);
    expect((await moderate('EXPIRED', { action: 'reactivate', reason })).status).toBe(409);
    expect((await statusOf('INACTIVE')).status).toBe('SUSPENDED');
  });

  it('409 si déjà suspendu ; PENDING hors périmètre (409)', async () => {
    as('ADMIN');
    expect((await moderate('EXPIRED', { action: 'suspend', reason })).status).toBe(409);
    expect((await moderate('PENDING', { action: 'suspend', reason })).status).toBe(409);
  });

  it('BANNED : réactivation refusée au LIBRARIAN (403), acceptée pour ADMIN', async () => {
    as('LIB');
    expect((await moderate('BANNED', { action: 'reactivate', reason })).status).toBe(403);
    as('ADMIN');
    expect((await moderate('BANNED', { action: 'reactivate', reason })).status).toBe(200);
    expect((await statusOf('BANNED')).status).toBe('ACTIVE');
    // ADMIN peut ensuite bannir : statut BANNED, autoSuspendedAt null.
    expect((await moderate('BANNED', { action: 'ban', reason })).status).toBe(200);
    expect(await statusOf('BANNED')).toEqual({ status: 'BANNED', autoSuspendedAt: null });
  });

  it('les refus n’écrivent aucune entrée de journal', async () => {
    for (const key of ['ADMIN', 'STAFFTARGET', 'STUDENT', 'INACTIVE', 'EXPIRED', 'PENDING']) {
      expect(await staffLogs(key), key).toHaveLength(0);
    }
  });

  it('une suspension MANUELLE n’est pas levée par /api/members/sync (inscriptionActive = true)', async () => {
    as('ADMIN');
    expect((await moderate('MANUAL', { action: 'suspend', reason })).status).toBe(200);

    const matricule = `STF-MANUAL-${suffix}`;
    const response = await membersSync(
      new NextRequest('http://localhost/api/members/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ members: [{ matricule, nom: 'MANUAL', prenom: 'Test', dateNaissance: '2000-01-01', inscriptionActive: true }] }),
      })
    );

    expect(response.status).toBe(200);
    expect((await response.json()).data.reactivated).toBe(0);
    expect(await statusOf('MANUAL')).toEqual({ status: 'SUSPENDED', autoSuspendedAt: null });
  });

  it('limitation : 30 actions par 15 min par membre du personnel, puis 429', async () => {
    await prisma.rateLimitBucket.deleteMany({ where: { key: rateLimitKey('staff-moderation', ids.LIB) } });
    as('LIB');
    for (let i = 0; i < 30; i += 1) {
      const { status } = await moderate('RATE', { action: i % 2 === 0 ? 'suspend' : 'reactivate', reason });
      expect(status).toBe(200);
    }
    const blocked = await moderate('RATE', { action: 'suspend', reason });

    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(await staffLogs('RATE')).toHaveLength(30);
  }, 60_000);
});
