import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StaffRole, User } from '@prisma/client';

// Base et session simulées : on vérifie que la décision repose sur la base,
// jamais sur le contenu du JWT.
const db = vi.hoisted(() => ({
  users: new Map<string, Partial<User>>(),
  assignments: [] as Array<{ userId: string; role: StaffRole; revokedAt: Date | null }>,
  mfa: new Map<string, { enabledAt: Date | null; epoch: number }>(),
  proof: undefined as string | undefined,
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (db.proof ? { value: db.proof } : undefined) }),
}));

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => db.users.get(where.id) ?? null),
    },
    staffMfa: {
      findUnique: vi.fn(async ({ where }: { where: { userId: string } }) => db.mfa.get(where.userId) ?? null),
    },
    staffAssignment: {
      findMany: vi.fn(
        async ({ where }: { where: { userId: string; revokedAt: null; role?: { in: StaffRole[] } } }) =>
          db.assignments
            .filter((row) => row.userId === where.userId)
            .filter((row) => (where.revokedAt === null ? row.revokedAt === null : true))
            .filter((row) => (where.role ? where.role.in.includes(row.role) : true))
            .map((row) => ({ role: row.role }))
      ),
    },
  },
}));

const { auth } = await import('@/lib/auth');
const { prisma } = await import('@/lib/prisma');
const { requireActiveUser, requireStaff } = await import('@/lib/authz');
const { createMfaProof } = await import('@/lib/staff-mfa');

const authMock = vi.mocked(auth as unknown as () => Promise<unknown>);

function sessionFor(id: string, claims: Record<string, unknown> = {}): void {
  authMock.mockResolvedValue({ user: { id, status: 'ACTIVE', ...claims }, expires: '2099-01-01' });
}

function addUser(id: string, status: User['status']): void {
  db.users.set(id, { id, status, email: `${id}@test.local` });
}

/** MFA valide : les refus de requireStaff ci-dessous viennent donc du rôle ou du statut. */
function verifyMfa(id: string): void {
  db.mfa.set(id, { enabledAt: new Date(Date.now() - 1000), epoch: 1 });
  db.proof = createMfaProof(id, 1);
}

async function bodyOf(response: Response): Promise<unknown> {
  return response.json();
}

beforeEach(() => {
  db.users.clear();
  db.assignments.length = 0;
  db.mfa.clear();
  db.proof = undefined;
  vi.clearAllMocks();
});

describe('requireActiveUser', () => {
  it('sans session : 401 JSON', async () => {
    authMock.mockResolvedValue(null);

    const result = await requireActiveUser();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      expect(await bodyOf(result.response)).toEqual({ success: false, message: 'Non authentifié' });
    }
  });

  it('compte actif : autorisé, utilisateur relu en base', async () => {
    addUser('u-active', 'ACTIVE');
    sessionFor('u-active');

    const result = await requireActiveUser();

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user.id).toBe('u-active');
    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u-active' } }));
    const { select } = vi.mocked(prisma.user.findUnique).mock.calls[0][0] as { select: Record<string, boolean> };
    expect(select.id).toBe(true);
    expect(select).not.toHaveProperty('password');
    expect(select).not.toHaveProperty('qrCode');
  });

  it.each(['SUSPENDED', 'BANNED', 'PENDING'] as const)('compte %s : 401', async (status) => {
    addUser('u-blocked', status);
    sessionFor('u-blocked');

    const result = await requireActiveUser();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it('jeton périmé : le JWT dit ACTIVE mais la base dit SUSPENDED → 401', async () => {
    addUser('u-stale', 'SUSPENDED');
    sessionFor('u-stale', { status: 'ACTIVE' });

    const result = await requireActiveUser();

    expect(result.ok).toBe(false);
  });

  it('jeton périmé : compte supprimé en base → 401', async () => {
    sessionFor('u-deleted');

    const result = await requireActiveUser();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });
});

describe('requireStaff', () => {
  it('affectation active du rôle demandé : autorisé', async () => {
    addUser('s-admin', 'ACTIVE');
    db.assignments.push({ userId: 's-admin', role: 'ADMIN', revokedAt: null });
    verifyMfa('s-admin');
    sessionFor('s-admin');

    const result = await requireStaff('ADMIN');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.staffRoles).toEqual(['ADMIN']);
  });

  it('sans rôle précisé : tout rôle actif suffit', async () => {
    addUser('s-lib', 'ACTIVE');
    db.assignments.push({ userId: 's-lib', role: 'LIBRARIAN', revokedAt: null });
    verifyMfa('s-lib');
    sessionFor('s-lib');

    expect((await requireStaff()).ok).toBe(true);
  });

  it('autre rôle seulement : 403', async () => {
    addUser('s-lib2', 'ACTIVE');
    db.assignments.push({ userId: 's-lib2', role: 'LIBRARIAN', revokedAt: null });
    verifyMfa('s-lib2');
    sessionFor('s-lib2');

    const result = await requireStaff('ADMIN');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      expect(await bodyOf(result.response)).toEqual({ success: false, message: 'Accès refusé' });
    }
  });

  it('affectation révoquée : 403, et la requête filtre bien revokedAt', async () => {
    addUser('s-revoked', 'ACTIVE');
    db.assignments.push({ userId: 's-revoked', role: 'ADMIN', revokedAt: new Date() });
    verifyMfa('s-revoked');
    sessionFor('s-revoked');

    const result = await requireStaff('ADMIN');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
    expect(prisma.staffAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 's-revoked', revokedAt: null }) })
    );
  });

  it('jeton périmé : un JWT qui prétend ADMIN ne suffit pas sans affectation en base', async () => {
    addUser('s-fake', 'ACTIVE');
    verifyMfa('s-fake');
    sessionFor('s-fake', { role: 'ADMIN', staffRoles: ['ADMIN'] });

    const result = await requireStaff('ADMIN');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it('membre du personnel suspendu : 401, affectations non consultées', async () => {
    addUser('s-suspended', 'SUSPENDED');
    db.assignments.push({ userId: 's-suspended', role: 'ADMIN', revokedAt: null });
    verifyMfa('s-suspended');
    sessionFor('s-suspended');

    const result = await requireStaff('ADMIN');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(prisma.staffAssignment.findMany).not.toHaveBeenCalled();
  });
});
