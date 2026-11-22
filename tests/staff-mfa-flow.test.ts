import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, type NextResponse } from 'next/server';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { prisma } from './helpers/local-db';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
const jar = vi.hoisted(() => ({ proof: undefined as string | undefined }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (jar.proof ? { value: jar.proof } : undefined) }),
}));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
}));

const { auth } = await import('@/lib/auth');
const mfa = await import('@/lib/staff-mfa');
const store = await import('@/lib/staff-mfa-store');
const { requireActiveUser, requireStaff } = await import('@/lib/authz');
const { getAuthenticatedUser } = await import('@/lib/api');
const { requireStaffPage } = await import('@/lib/staff-page');
const { POST: enroll } = await import('@/app/api/staff/mfa/enrollment/route');
const { POST: activate } = await import('@/app/api/staff/mfa/activate/route');
const { POST: verify } = await import('@/app/api/staff/mfa/verify/route');
const { POST: regenerate } = await import('@/app/api/staff/mfa/recovery-codes/route');
const { PATCH: moderate } = await import('@/app/api/staff/accounts/[id]/status/route');
const { GET: me } = await import('@/app/api/auth/me/route');
const { PATCH: changePassword } = await import('@/app/api/auth/change-password/route');
const { GET: profileGet, PATCH: profilePatch } = await import('@/app/api/profile/route');
const { POST: attendancePost } = await import('@/app/api/attendance/route');
const { PATCH: attendancePatch } = await import('@/app/api/attendance/[id]/route');
const { PATCH: renew } = await import('@/app/api/loans/[id]/renew/route');
const { PATCH: notifRead } = await import('@/app/api/notifications/[id]/read/route');
const { PATCH: notifReadAll } = await import('@/app/api/notifications/read-all/route');
const { PATCH: notifPatch } = await import('@/app/api/notifications/route');
const { POST: reservationPost } = await import('@/app/api/reservations/route');
const { PATCH: reservationCancel } = await import('@/app/api/reservations/[id]/cancel/route');
const { default: SecurityPage } = await import('@/app/(staff)/personnel/securite/page');
const { default: ActivationPage } = await import('@/app/(staff)/personnel/securite/activation/page');

const suffix = randomUUID().slice(0, 8);
const startedAt = new Date();
const userIds: string[] = [];
const authMock = vi.mocked(auth as unknown as (...args: unknown[]) => Promise<unknown>);
let counter = 0;
const FAKE_HASH = `$2b$12$FIXTUREHASH${suffix}`;

async function createUser(staff = true, password = FAKE_HASH): Promise<string> {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: `mfa-${counter}-${suffix}@test.local`,
      username: `mfa_${counter}_${suffix}`,
      password,
      qrCode: `data:image/png;base64,FIXTUREQR${suffix}`,
      firstName: 'Mfa',
      lastName: `T${counter}`,
      status: 'ACTIVE',
    },
  });
  userIds.push(user.id);
  if (staff) await prisma.staffAssignment.create({ data: { userId: user.id, role: 'ADMIN' } });
  return user.id;
}

/** MFA déjà activée, secret connu ; dernier pas consommé bien antérieur. */
async function enrolled(id: string, enabledAt = new Date(Date.now() - 1000)): Promise<string> {
  const secret = mfa.generateTotpSecret();
  await prisma.staffMfa.create({ data: { userId: id, secretCipher: mfa.encryptMfaSecret(secret), enabledAt } });
  return secret;
}

function as(id: string | null, proof?: string): void {
  jar.proof = proof;
  authMock.mockResolvedValue(id ? { user: { id, status: 'ACTIVE' }, expires: '2099-01-01' } : null);
}

let ipCounter = 0;
const nextIp = (): string => {
  ipCounter += 1;
  return `198.18.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
};

function req(method: string, body?: unknown, options: { origin?: string | null; ip?: string } = {}): NextRequest {
  const headers: Record<string, string> = { host: 'localhost', 'content-type': 'application/json', 'x-forwarded-for': options.ip ?? nextIp() };
  const origin = options.origin === undefined ? 'http://localhost' : options.origin;
  if (origin) headers.origin = origin;
  return new NextRequest('http://localhost/api/test', { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

async function read(response: NextResponse | Response) {
  return { status: response.status, body: await response.clone().json(), setCookie: response.headers.get('set-cookie') ?? '' };
}

const nowCode = (secret: string, delta = 0): string => mfa.totpCodeForStep(secret, mfa.totpStepAt(Date.now()) + delta);

async function redirectTarget(promise: Promise<unknown>): Promise<string> {
  const error = (await promise.then(() => null, (e: unknown) => e)) as { digest?: string } | null;
  return error?.digest ?? '';
}

beforeEach(() => {
  authMock.mockReset();
  jar.proof = undefined;
});

afterAll(async () => {
  // Le test d'Origin crée une vraie présence : à retirer avant les comptes.
  await prisma.attendance.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.activityLog.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { action: { startsWith: 'staff.account.' }, createdAt: { gte: startedAt } }] } });
  await prisma.verificationToken.deleteMany({ where: { identifier: { in: userIds.map((id) => `staff-mfa-activation:${id}`) } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.rateLimitBucket.deleteMany({ where: { windowStart: { gte: new Date(startedAt.getTime() - 1000) } } });
});

describe('accès selon l’état de la double authentification', () => {
  const moderation = (target: string) =>
    moderate(req('PATCH', { action: 'suspend', reason: 'Motif de test' }), { params: Promise.resolve({ id: target }) });

  it('personnel sans MFA : page → activation, API → 403 mfa_required', async () => {
    const id = await createUser();
    const target = await createUser(false);
    as(id);

    expect(await redirectTarget(requireStaffPage())).toContain('/personnel/securite/activation');
    const result = await read(await moderation(target));
    expect(result.status).toBe(403);
    expect(result.body.code).toBe('mfa_required');
  });

  it('MFA activée sans cookie : page → vérification, API → 403 mfa_required', async () => {
    const id = await createUser();
    const target = await createUser(false);
    await enrolled(id);
    as(id);

    expect(await redirectTarget(requireStaffPage())).toContain('/personnel/securite/verification');
    expect((await read(await moderation(target))).body.code).toBe('mfa_required');
  });

  it('cookie valide : accès page et API', async () => {
    const id = await createUser();
    const target = await createUser(false);
    await enrolled(id);
    as(id, mfa.createMfaProof(id, 1));

    await expect(requireStaffPage()).resolves.toMatchObject({ mfaState: 'verified' });
    expect((await moderation(target)).status).toBe(200);
  });

  it('cookie d’un autre utilisateur, altéré, expiré ou d’une ancienne époque : refus', async () => {
    const id = await createUser();
    const other = await createUser();
    await enrolled(id, new Date(Date.now() - 14 * 3_600_000));
    await enrolled(other);
    const valid = mfa.createMfaProof(id, 1);
    const refused = [
      mfa.createMfaProof(other, 1),
      `${valid.slice(0, -2)}xx`,
      mfa.createMfaProof(id, 1, Date.now() - 12 * 3_600_000 - 1000),
      mfa.createMfaProof(id, 0),
    ];

    for (const proof of refused) {
      as(id, proof);
      const result = await requireStaff();
      expect(result.ok).toBe(false);
      if (!result.ok) expect((await read(result.response)).body.code).toBe('mfa_required');
    }
  });

  it('après reset : l’ancien cookie est refusé', async () => {
    const id = await createUser();
    await enrolled(id);
    const proof = mfa.createMfaProof(id, 1);
    as(id, proof);
    expect((await requireStaff()).ok).toBe(true);

    await prisma.$transaction((tx) => store.resetStaffMfa(tx, id));
    expect((await requireStaff()).ok).toBe(false);
    expect(await prisma.staffMfa.findUnique({ where: { userId: id } })).toMatchObject({ epoch: 2, secretCipher: '', enabledAt: null });
  });

  it('révocation puis nouvel enrôlement : un cookie antérieur reste refusé', async () => {
    const id = await createUser();
    await enrolled(id, new Date(Date.now() - 5000));
    const old = mfa.createMfaProof(id, 1, Date.now() - 1000);
    await prisma.$transaction((tx) => store.removeStaffMfa(tx, id));
    await enrolled(id);
    as(id, old);

    expect((await requireStaff()).ok).toBe(false);
  });
});

describe('activation', () => {
  it('sans code, code faux, expiré, ou d’un autre compte : refus sans créer de secret', async () => {
    const id = await createUser();
    const other = await createUser();
    const otherCode = await store.issueActivationCode(prisma, other);
    const expired = await store.issueActivationCode(prisma, id);
    await prisma.verificationToken.updateMany({ where: { identifier: `staff-mfa-activation:${id}` }, data: { expires: new Date(Date.now() - 1000) } });
    as(id);

    expect((await enroll(req('POST', {}))).status).toBe(400);
    expect((await enroll(req('POST', { activationCode: 'AAAAA-BBBBB-CCCCC-DDDDD' }))).status).toBe(400);
    expect((await enroll(req('POST', { activationCode: expired }))).status).toBe(400);
    expect((await enroll(req('POST', { activationCode: otherCode }))).status).toBe(400);
    expect(await prisma.staffMfa.findUnique({ where: { userId: id } })).toBeNull();
  });

  it('parcours complet : QR, secret chiffré, 10 codes hachés, cookie, code consommé, aucun secret journalisé', async () => {
    const id = await createUser();
    const code = await store.issueActivationCode(prisma, id);
    as(id);

    const started = await read(await enroll(req('POST', { activationCode: code })));
    expect(started.status).toBe(200);
    expect(started.body.data.qrCode).toMatch(/^data:image\/svg\+xml;base64,/);
    const secret = started.body.data.secret as string;
    const pending = await prisma.staffMfa.findUniqueOrThrow({ where: { userId: id } });
    expect(pending.enabledAt).toBeNull();
    expect(pending.secretCipher).not.toContain(secret);
    expect(mfa.decryptMfaSecret(pending.secretCipher)).toBe(secret);

    // Sans le code d'activation, la confirmation échoue.
    expect((await activate(req('POST', { activationCode: 'AAAAA-BBBBB-CCCCC-DDDDD', code: nowCode(secret) }))).status).toBe(400);

    const done = await read(await activate(req('POST', { activationCode: code, code: nowCode(secret) })));
    expect(done.status).toBe(200);
    const recovery = done.body.data.recoveryCodes as string[];
    expect(recovery).toHaveLength(10);
    expect(done.setCookie).toMatch(/staff_mfa=/);
    expect(done.setCookie).toMatch(/HttpOnly/i);
    expect(done.setCookie).toMatch(/SameSite=strict/i);
    expect(done.setCookie).toMatch(/Path=\//i);

    const stored = await prisma.staffRecoveryCode.findMany({ where: { userId: id } });
    expect(stored).toHaveLength(10);
    for (const row of stored) expect(recovery).not.toContain(row.codeHash);
    expect(await prisma.verificationToken.count({ where: { identifier: `staff-mfa-activation:${id}` } })).toBe(0);

    // Code déjà utilisé : activation refusée (déjà active).
    expect((await enroll(req('POST', { activationCode: code }))).status).toBe(409);
    await prisma.$transaction((tx) => store.resetStaffMfa(tx, id));
    expect((await enroll(req('POST', { activationCode: code }))).status).toBe(400);

    const proof = done.setCookie.match(/staff_mfa=([^;]+)/)![1];
    const logs = JSON.stringify(await prisma.activityLog.findMany({ where: { userId: id } }));
    expect(logs).toContain('auth.mfa.enrolled');
    for (const sensitive of [secret, code, proof, ...recovery]) expect(logs).not.toContain(sensitive);
    expect(JSON.stringify(done.body)).not.toContain(secret);
    expect(JSON.stringify(done.body)).not.toContain(proof);
  });
});

describe('vérification', () => {
  it('code TOTP : accepté une fois, le même pas est refusé ; ±1 accepté, ±2 refusé', async () => {
    const id = await createUser();
    const secret = await enrolled(id);
    as(id);

    const first = await read(await verify(req('POST', { code: nowCode(secret, -1) })));
    expect(first.status).toBe(200);
    expect(first.setCookie).toMatch(/staff_mfa=/);
    expect((await verify(req('POST', { code: nowCode(secret, -1) }))).status).toBe(400);
    expect((await verify(req('POST', { code: nowCode(secret, 1) }))).status).toBe(200);

    const second = await createUser();
    const secondSecret = await enrolled(second);
    as(second);
    const far = nowCode(secondSecret, 2);
    if (![-1, 0, 1].some((delta) => nowCode(secondSecret, delta) === far)) {
      expect((await verify(req('POST', { code: far }))).status).toBe(400);
    }
    const near = nowCode(secondSecret, -2);
    if (![-1, 0, 1].some((delta) => nowCode(secondSecret, delta) === near)) {
      expect((await verify(req('POST', { code: near }))).status).toBe(400);
    }
  });

  it('code de secours : une seule fois, journalisé sans le code', async () => {
    const id = await createUser();
    await enrolled(id);
    const [code] = await store.replaceRecoveryCodes(prisma, id);
    as(id);

    expect((await verify(req('POST', { code }))).status).toBe(200);
    expect((await verify(req('POST', { code }))).status).toBe(400);
    expect(await store.countRemainingRecoveryCodes(prisma, id)).toBe(9);
    const logs = await prisma.activityLog.findMany({ where: { userId: id } });
    expect(logs.map((log) => log.action)).toContain('auth.mfa.recovery_used');
    expect(JSON.stringify(logs)).not.toContain(code);
  });

  it('régénération : exige la preuve et un TOTP, invalide les anciens codes', async () => {
    const id = await createUser();
    const secret = await enrolled(id);
    const [oldCode] = await store.replaceRecoveryCodes(prisma, id);

    as(id);
    expect((await read(await regenerate(req('POST', { code: nowCode(secret) })))).body.code).toBe('mfa_required');

    as(id, mfa.createMfaProof(id, 1));
    const result = await read(await regenerate(req('POST', { code: nowCode(secret) })));
    expect(result.status).toBe(200);
    expect(result.body.data.recoveryCodes).toHaveLength(10);
    expect(await store.consumeRecoveryCode(prisma, id, oldCode)).toBe(false);
  });

  it('limitation : 5 échecs par compte, puis 429 même avec un code valide', async () => {
    const id = await createUser();
    const secret = await enrolled(id);
    as(id);

    for (let i = 0; i < 5; i += 1) expect((await verify(req('POST', { code: 'ZZZZZ-ZZZZZ' }))).status).toBe(400);
    const blocked = await verify(req('POST', { code: nowCode(secret) }));

    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('limitation : 20 échecs par IP, tous comptes confondus', async () => {
    const ip = '203.0.113.77';
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const id = await createUser();
      await enrolled(id);
      ids.push(id);
      as(id);
      for (let attempt = 0; attempt < 4; attempt += 1) {
        expect((await verify(req('POST', { code: 'ZZZZZ-ZZZZZ' }, { ip }))).status).toBe(400);
      }
    }

    as(ids[0]);
    expect((await verify(req('POST', { code: 'ZZZZZ-ZZZZZ' }, { ip }))).status).toBe(429);
    expect((await verify(req('POST', { code: 'ZZZZZ-ZZZZZ' }))).status).toBe(400);
  });

  it('pages de sécurité : aucun secret ni code rendu', async () => {
    const id = await createUser();
    const secret = await enrolled(id);
    const codes = await store.replaceRecoveryCodes(prisma, id);
    as(id, mfa.createMfaProof(id, 1));

    const html = renderToStaticMarkup((await SecurityPage()) as ReactElement);
    expect(html).toContain('Codes de secours restants');
    for (const value of [secret, ...codes]) expect(html).not.toContain(value);

    const fresh = await createUser();
    as(fresh);
    expect(renderToStaticMarkup((await ActivationPage()) as ReactElement)).toContain("Code d&#x27;activation");
  });
});

describe('objets utilisateur', () => {
  it('requireActiveUser, getAuthenticatedUser et /api/auth/me : jamais password ni qrCode', async () => {
    const id = await createUser(false);
    as(id);
    const active = await requireActiveUser();
    const raw = await getAuthenticatedUser();
    const response = await read(await me());

    expect(active.ok).toBe(true);
    for (const value of [active.ok ? active.user : {}, raw ?? {}, response.body.data]) {
      expect(value).not.toHaveProperty('password');
      expect(value).not.toHaveProperty('qrCode');
      expect(JSON.stringify(value)).not.toContain('FIXTURE');
    }
    expect(response.body.data.id).toBe(id);
  });

  it('changement de mot de passe : fonctionne avec sa requête dédiée', async () => {
    const id = await createUser(false, await hash('Ancien1234', 4));
    as(id);

    const wrong = { currentPassword: 'Mauvais1234', newPassword: 'Nouveau1234', confirmPassword: 'Nouveau1234' };
    expect((await changePassword(req('PATCH', wrong))).status).toBe(400);
    expect((await changePassword(req('PATCH', { ...wrong, currentPassword: 'Ancien1234' }))).status).toBe(200);
  });

  it('non-personnel : parcours inchangé, sans cookie ni MFA', async () => {
    const id = await createUser(false);
    as(id);

    expect((await profileGet()).status).toBe(200);
    expect((await requireActiveUser()).ok).toBe(true);
    await expect(requireStaffPage()).rejects.toMatchObject({ digest: expect.stringContaining('404') });
    expect(await prisma.staffMfa.count({ where: { userId: id } })).toBe(0);
  });
});

describe('contrôle d’Origin des routes migrées', () => {
  const params = { params: Promise.resolve({ id: 'inexistant' }) };
  const routes: Array<[string, (request: NextRequest) => Promise<Response>]> = [
    ['POST /api/attendance', (r) => attendancePost(r)],
    ['PATCH /api/attendance/[id]', (r) => attendancePatch(r, params)],
    ['PATCH /api/auth/change-password', (r) => changePassword(r)],
    ['PATCH /api/loans/[id]/renew', (r) => renew(r, params)],
    ['PATCH /api/notifications/[id]/read', (r) => notifRead(r, params)],
    ['PATCH /api/notifications/read-all', (r) => notifReadAll(r)],
    ['PATCH /api/notifications', (r) => notifPatch(r)],
    ['PATCH /api/profile', (r) => profilePatch(r)],
    ['POST /api/reservations', (r) => reservationPost(r)],
    ['PATCH /api/reservations/[id]/cancel', (r) => reservationCancel(r, params)],
  ];

  it.each(routes)('%s : Origin absent ou étranger → 403, même origine → traité', async (_name, handler) => {
    const id = await createUser(false, await hash('Ancien1234', 4));
    as(id);

    for (const origin of [null, 'https://evil.example']) {
      const result = await read(await handler(req('PATCH', {}, { origin })));
      expect(result.status).toBe(403);
      expect(result.body).toEqual({ success: false, message: 'Origine de la requête non autorisée' });
    }
    expect((await handler(req('PATCH', {}))).status).not.toBe(403);
  });
});
