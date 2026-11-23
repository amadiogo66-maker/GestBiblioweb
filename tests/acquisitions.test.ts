import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from './helpers/local-db';
import { runTsScript } from './helpers/run-script';
import { cleanupWorld, createWorld, jsonRequest, params, proofFor, sessionFor, type Profile, type World } from './helpers/department-fixtures';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
const jar = vi.hoisted(() => ({ proof: undefined as string | undefined }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => (jar.proof ? { value: jar.proof } : undefined) }) }));

const { auth } = await import('@/lib/auth');
const { evaluateAcquisitionDecision } = await import('@/lib/acquisitions');
const { canAccessDepartment, departmentActorFrom } = await import('@/lib/department-access');
const { evaluateModeration } = await import('@/lib/staff-moderation');
const { rateLimitKey } = await import('@/lib/rate-limit');
const { ACQUISITION_OPEN_QUOTA, RATE_LIMITS } = await import('@/lib/constants');
const { POST: propose } = await import('@/app/api/teacher/acquisitions/route');
const { DELETE: withdraw } = await import('@/app/api/teacher/acquisitions/[id]/route');
const { PATCH: decide } = await import('@/app/api/staff/acquisitions/[id]/route');
const { PATCH: moderate } = await import('@/app/api/staff/accounts/[id]/status/route');

const authMock = vi.mocked(auth as unknown as (...args: unknown[]) => Promise<unknown>);
const startedAt = new Date();
let world: World;

function as(profile: Profile | null, claims: Record<string, unknown> = {}): void {
  const id = profile ? world.users[profile].id : null;
  jar.proof = id ? proofFor(id) : undefined;
  authMock.mockResolvedValue(sessionFor(id, claims));
}

const read = async (response: Response) => ({ status: response.status, body: await response.json() });
const proposal = (overrides: Record<string, unknown> = {}) => ({ title: 'Manuel de test', author: 'Auteur Test', justification: 'Indispensable au cours de L2', ...overrides });

async function requestIn(dept: 'A' | 'B', status: 'SUBMITTED' | 'DEPT_APPROVED' | 'LIBRARY_ACCEPTED' = 'SUBMITTED', requester: Profile = dept === 'A' ? 'requesterA' : 'requesterB') {
  return prisma.acquisitionRequest.create({
    data: {
      requesterId: world.users[requester].id,
      departmentId: dept === 'A' ? world.deptA.id : world.deptB.id,
      title: `Proposition ${dept} ${Math.random().toString(36).slice(2, 7)}`,
      author: 'Auteur',
      justification: 'Justification suffisante',
      status,
    },
  });
}

const decision = (id: string, body: unknown) => decide(jsonRequest('PATCH', body), params({ id }));

beforeAll(async () => {
  world = await createWorld(4);
});

beforeEach(() => {
  authMock.mockReset();
  jar.proof = undefined;
});

afterAll(async () => {
  await cleanupWorld(world, startedAt);
});

describe('règles pures', () => {
  const managerA = () => departmentActorFrom('m', [{ role: 'DEPARTMENT_MANAGER', departmentId: 'A' }]);
  const librarian = () => departmentActorFrom('l', [{ role: 'LIBRARIAN', departmentId: null }]);

  it('canAccessDepartment : responsable limité à ses départements, bibliothèque à tous', () => {
    const multi = departmentActorFrom('m', [
      { role: 'DEPARTMENT_MANAGER', departmentId: 'A' },
      { role: 'DEPARTMENT_MANAGER', departmentId: 'C' },
    ]);

    expect(canAccessDepartment(managerA(), 'A')).toBe(true);
    expect(canAccessDepartment(managerA(), 'B')).toBe(false);
    expect(canAccessDepartment(multi, 'C')).toBe(true);
    expect(canAccessDepartment(librarian(), 'B')).toBe(true);
    expect(canAccessDepartment(librarian(), null)).toBe(false);
    expect(canAccessDepartment(departmentActorFrom('x', []), 'A')).toBe(false);
  });

  it.each<[string, 'A' | 'B', string, string, 'm' | 'l', number | 'ok']>([
    ['responsable valide son département', 'A', 'SUBMITTED', 'approve', 'm', 'ok'],
    ['responsable, autre département', 'B', 'SUBMITTED', 'approve', 'm', 404],
    ['responsable ne peut pas accepter pour la bibliothèque', 'A', 'DEPT_APPROVED', 'accept', 'm', 403],
    ['double validation', 'A', 'DEPT_APPROVED', 'approve', 'm', 409],
    ['acquis avant acceptation', 'A', 'DEPT_APPROVED', 'acquired', 'l', 409],
    ['acceptation d’une proposition non validée', 'A', 'SUBMITTED', 'accept', 'l', 409],
    ['acceptation après refus', 'A', 'DEPT_REJECTED', 'accept', 'l', 409],
    ['bibliothèque accepte', 'A', 'DEPT_APPROVED', 'accept', 'l', 'ok'],
    ['bibliothèque marque acquis', 'A', 'LIBRARY_ACCEPTED', 'acquired', 'l', 'ok'],
  ])('%s', (_label, dept, status, action, who, expected) => {
    const result = evaluateAcquisitionDecision(who === 'm' ? managerA() : librarian(), { departmentId: dept, status: status as never }, action as never);

    expect(result.allowed ? 'ok' : result.httpStatus).toBe(expected);
  });

  it('décision de la bibliothèque à la place d’un responsable : marquée comme substitution', () => {
    const result = evaluateAcquisitionDecision(librarian(), { departmentId: 'A', status: 'SUBMITTED' }, 'approve');

    expect(result).toMatchObject({ allowed: true, substitute: true });
    expect(evaluateAcquisitionDecision(managerA(), { departmentId: 'A', status: 'SUBMITTED' }, 'approve')).toMatchObject({ substitute: false });
  });

  it('modération des comptes : un responsable de département n’est pas modérateur', () => {
    const target = { id: 't', status: 'ACTIVE' as const, hasActiveStaffRole: false, member: null };

    expect(evaluateModeration({ id: 'm', roles: ['DEPARTMENT_MANAGER'] }, target, 'suspend')).toMatchObject({ allowed: false, httpStatus: 403 });
    expect(evaluateModeration({ id: 'l', roles: ['LIBRARIAN'] }, target, 'suspend')).toMatchObject({ allowed: true });
  });
});

describe('matrice d’accès : API des propositions', () => {
  it.each<[string, Profile | null, number]>([
    ['non connecté', null, 401],
    ['étudiant', 'student', 403],
    ['JWT prétendant TEACHER', 'jwtLiar', 403],
    ['enseignant sans département', 'teacherNoDept', 403],
    ['enseignant', 'teacherA', 201],
  ])('dépôt — %s : %i', async (_label, profile, status) => {
    as(profile);

    expect((await propose(jsonRequest('POST', proposal()))).status).toBe(status);
  });

  it.each<[string, Profile | null, number, Record<string, unknown>?]>([
    ['non connecté', null, 401],
    ['étudiant', 'student', 403],
    ['enseignant', 'teacherA', 403],
    ['JWT prétendant être du personnel', 'jwtLiar', 403, { staffRoles: ['ADMIN'] }],
    ['responsable révoqué', 'revokedManager', 403],
    ['responsable suspendu', 'suspendedManager', 401],
    ['responsable du département B', 'managerB', 404],
    ['responsable du département A', 'managerA', 200],
  ])('décision du département — %s : %i', async (_label, profile, status, claims) => {
    const request = await requestIn('A');
    as(profile, claims);

    expect((await decision(request.id, { action: 'approve' })).status).toBe(status);
  });

  it('personnel sans preuve MFA : 403 mfa_required', async () => {
    const request = await requestIn('A');
    as('managerA');
    jar.proof = undefined;
    const response = await read(await decision(request.id, { action: 'approve' }));

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('mfa_required');
  });

  it('responsable : ne peut pas modérer les comptes du site (403)', async () => {
    as('managerA');
    const response = await moderate(jsonRequest('PATCH', { action: 'suspend', reason: 'Motif de test' }), params({ id: world.users.student.id }));

    expect(response.status).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: world.users.student.id } })).status).toBe('ACTIVE');
  });
});

describe('circuit complet et IDOR', () => {
  it('SUBMITTED → DEPT_APPROVED → LIBRARY_ACCEPTED → ACQUIRED, journal et notifications sans doublon', async () => {
    as('teacherA');
    const created = await read(await propose(jsonRequest('POST', proposal({ title: 'Circuit complet', isbn: '978-2-07-036024-5' }))));
    const id = created.body.data.id as string;
    expect(created.status).toBe(201);
    expect((await prisma.acquisitionRequest.findUniqueOrThrow({ where: { id } })).isbn).toBe('9782070360245');

    as('managerA');
    expect((await decision(id, { action: 'reject' })).status).toBe(400);
    expect((await decision(id, { action: 'approve', note: 'Validé en conseil' })).status).toBe(200);
    expect((await decision(id, { action: 'approve' })).status).toBe(409);
    expect((await decision(id, { action: 'accept' })).status).toBe(403);

    as('librarian');
    expect((await decision(id, { action: 'acquired' })).status).toBe(409);
    expect((await decision(id, { action: 'refuse' })).status).toBe(400);
    expect((await decision(id, { action: 'accept' })).status).toBe(200);
    expect((await decision(id, { action: 'acquired' })).status).toBe(200);
    expect((await decision(id, { action: 'acquired' })).status).toBe(409);

    const final = await prisma.acquisitionRequest.findUniqueOrThrow({ where: { id } });
    expect(final).toMatchObject({
      status: 'ACQUIRED',
      departmentDecidedById: world.users.managerA.id,
      departmentNote: 'Validé en conseil',
      libraryDecidedById: world.users.librarian.id,
    });
    expect(final.acquiredAt).not.toBeNull();

    const notifications = await prisma.notification.findMany({ where: { userId: world.users.teacherA.id, dedupeKey: { startsWith: `acquisition:${id}:` } }, orderBy: { createdAt: 'asc' } });
    expect(notifications.map((n) => n.dedupeKey)).toEqual([`acquisition:${id}:DEPT_APPROVED`, `acquisition:${id}:LIBRARY_ACCEPTED`, `acquisition:${id}:ACQUIRED`]);
    expect(notifications.every((n) => n.source === 'site')).toBe(true);
    for (const n of notifications) {
      expect(n.message).toContain('Circuit complet');
      expect(n.message).not.toContain(world.users.managerA.firstName);
      expect(n.message).not.toContain(world.users.librarian.firstName);
      expect(n.message).not.toContain('@');
    }
    expect(notifications[2].type).toBe('NEW_ACQUISITION');

    const actions = (await prisma.activityLog.findMany({ where: { action: { startsWith: 'acquisition.' }, details: { path: ['requestId'], equals: id } }, select: { action: true } })).map((l) => l.action);
    expect(actions.sort()).toEqual(['acquisition.acquired', 'acquisition.dept_approved', 'acquisition.library_accepted', 'acquisition.submit'].sort());
  });

  it('refus du département : motif obligatoire (5 à 500), notification, plus de décision possible', async () => {
    const request = await requestIn('A');
    as('managerA');

    expect((await decision(request.id, { action: 'reject', note: 'Non' })).status).toBe(400);
    expect((await decision(request.id, { action: 'reject', note: 'x'.repeat(501) })).status).toBe(400);
    expect((await decision(request.id, { action: 'reject', note: 'Hors programme du cours' })).status).toBe(200);
    as('librarian');
    expect((await decision(request.id, { action: 'accept' })).status).toBe(409);
    expect(await prisma.notification.count({ where: { dedupeKey: `acquisition:${request.id}:DEPT_REJECTED` } })).toBe(1);
  });

  it('bibliothécaire ou administrateur à la place d’un responsable absent : journalisé comme substitution', async () => {
    const request = await requestIn('B');
    as('admin');

    expect((await decision(request.id, { action: 'approve' })).status).toBe(200);
    const log = await prisma.activityLog.findFirst({ where: { action: 'acquisition.dept_approved', details: { path: ['requestId'], equals: request.id } } });
    expect(log?.details).toMatchObject({ substitute: true });
  });

  it('IDOR : un enseignant ne retire pas la proposition d’un autre ; retrait seulement si SUBMITTED', async () => {
    const other = await requestIn('A', 'SUBMITTED', 'teacherA');
    as('teacherA2');
    expect((await withdraw(jsonRequest('DELETE'), params({ id: other.id }))).status).toBe(404);
    expect(await prisma.acquisitionRequest.count({ where: { id: other.id } })).toBe(1);

    as('teacherA');
    const decided = await requestIn('A', 'DEPT_APPROVED', 'teacherA');
    expect((await withdraw(jsonRequest('DELETE'), params({ id: decided.id }))).status).toBe(409);
    expect((await withdraw(jsonRequest('DELETE'), params({ id: other.id }))).status).toBe(200);
    expect(await prisma.acquisitionRequest.count({ where: { id: other.id } })).toBe(0);
  });

  it('IDOR : un responsable B ne décide rien du département A (404, rien ne change)', async () => {
    const request = await requestIn('A');
    as('managerB');

    for (const action of ['approve', 'reject']) {
      expect((await decision(request.id, { action, note: 'Tentative de B' })).status).toBe(404);
    }
    expect((await prisma.acquisitionRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe('SUBMITTED');
  });

  it('identifiant inexistant : 404 identique', async () => {
    as('managerA');
    const response = await read(await decision('inexistant', { action: 'approve' }));

    expect(response).toEqual({ status: 404, body: { success: false, message: 'Proposition introuvable' } });
  });
});

describe('dépôt : doublons, quota, limitation, Origin', () => {
  it('ISBN déjà au catalogue : avertissement (409 duplicate_warning) puis confirmation', async () => {
    const book = await prisma.book.findUniqueOrThrow({ where: { id: world.books[0] }, select: { isbn: true, title: true } });
    as('teacherB');
    const warned = await read(await propose(jsonRequest('POST', proposal({ isbn: book.isbn }))));

    expect(warned.status).toBe(409);
    expect(warned.body.code).toBe('duplicate_warning');
    expect(warned.body.data.catalogBook).toMatchObject({ id: world.books[0], title: book.title });
    expect((await propose(jsonRequest('POST', proposal({ isbn: book.isbn, acknowledgeDuplicates: true })))).status).toBe(201);
  });

  it('même ISBN déjà proposé dans le département : avertissement', async () => {
    as('teacherA');
    expect((await propose(jsonRequest('POST', proposal({ isbn: '9780306406157' })))).status).toBe(201);
    as('teacherA2');
    const warned = await read(await propose(jsonRequest('POST', proposal({ isbn: '978-0-306-40615-7' }))));

    expect(warned.status).toBe(409);
    expect(warned.body.data.pendingInDepartment).toBe(true);
  });

  it('quota de 10 propositions ouvertes', async () => {
    const owner = world.users.teacherB.id;
    const open = await prisma.acquisitionRequest.count({ where: { requesterId: owner, status: { in: ['SUBMITTED', 'DEPT_APPROVED', 'LIBRARY_ACCEPTED'] } } });
    await prisma.acquisitionRequest.createMany({
      data: Array.from({ length: ACQUISITION_OPEN_QUOTA - open }, (_, i) => ({ requesterId: owner, departmentId: world.deptB.id, title: `Quota ${i}`, author: 'A', justification: 'Justification suffisante' })),
    });
    as('teacherB');
    const response = await read(await propose(jsonRequest('POST', proposal())));

    expect(response.status).toBe(409);
    expect(response.body.message).toContain('10');
  });

  it('validation : justification trop courte, ISBN invalide', async () => {
    as('teacherA2');

    expect((await propose(jsonRequest('POST', proposal({ justification: 'court' })))).status).toBe(400);
    expect((await propose(jsonRequest('POST', proposal({ isbn: '12345' })))).status).toBe(400);
  });

  it('limitation de débit et Origin', async () => {
    as('teacherA2');
    expect((await propose(jsonRequest('POST', proposal(), { origin: null }))).status).toBe(403);

    const key = rateLimitKey('acquisition-create', world.users.teacherA2.id);
    const full = { count: RATE_LIMITS.acquisitionCreate.limit, windowStart: new Date() };
    await prisma.rateLimitBucket.upsert({ where: { key }, create: { key, ...full }, update: full });
    expect((await propose(jsonRequest('POST', proposal()))).status).toBe(429);
  });
});

describe('contrainte CHECK et unicité des affectations', () => {
  const insert = (role: string, departmentId: string | null, userId = world.users.student.id) =>
    prisma.$executeRaw`INSERT INTO "StaffAssignment" ("id", "userId", "role", "departmentId", "createdAt")
      VALUES (${`chk-${Math.random().toString(36).slice(2)}`}, ${userId}, ${role}::"StaffRole", ${departmentId}, now())`;

  it('DEPARTMENT_MANAGER sans département : refusé par la base', async () => {
    await expect(insert('DEPARTMENT_MANAGER', null)).rejects.toThrow(/StaffAssignment_department_scope_check/);
  });

  it('ADMIN ou LIBRARIAN avec département : refusé par la base', async () => {
    await expect(insert('ADMIN', world.deptA.id)).rejects.toThrow(/StaffAssignment_department_scope_check/);
    await expect(insert('LIBRARIAN', world.deptA.id)).rejects.toThrow(/StaffAssignment_department_scope_check/);
  });

  it('un responsable peut gérer deux départements ; les doublons sont impossibles', async () => {
    const userId = world.users.teacherA2.id;
    await insert('DEPARTMENT_MANAGER', world.deptA.id, userId);
    await insert('DEPARTMENT_MANAGER', world.deptB.id, userId);

    await expect(insert('DEPARTMENT_MANAGER', world.deptA.id, userId)).rejects.toThrow(/23505|duplicate key|Unique constraint/);
    await insert('LIBRARIAN', null, userId);
    await expect(insert('LIBRARIAN', null, userId)).rejects.toThrow(/23505|duplicate key|Unique constraint/);
    await prisma.staffAssignment.deleteMany({ where: { userId } });
  });

  it('les deux index partiels d’unicité existent en base', async () => {
    const rows = await prisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'StaffAssignment' AND indexname LIKE 'StaffAssignment_user_role_%'`;

    expect(rows.map((row) => row.indexname).sort()).toEqual(['StaffAssignment_user_role_department_key', 'StaffAssignment_user_role_global_key']);
    expect(rows.every((row) => row.indexdef.startsWith('CREATE UNIQUE INDEX') && row.indexdef.includes('WHERE'))).toBe(true);
  });

  it('un département qui a un responsable ne peut pas être supprimé (Restrict)', async () => {
    await expect(prisma.department.delete({ where: { id: world.deptA.id } })).rejects.toThrow();
  });
});

describe('scripts', () => {
  const grant = (...args: string[]) => runTsScript('scripts/staff-grant.ts', ['grant', ...args]);
  const revoke = (...args: string[]) => runTsScript('scripts/staff-grant.ts', ['revoke', ...args]);
  const failure = (run: () => string): string => {
    try {
      run();
      return '';
    } catch (error) {
      return String((error as { stderr?: string }).stderr ?? error);
    }
  };

  it('staff:grant : --department obligatoire pour DEPARTMENT_MANAGER, refusé pour les autres, slug inconnu refusé', { timeout: 60_000 }, () => {
    const email = world.users.teacherB.email;

    expect(failure(() => grant(email, 'DEPARTMENT_MANAGER', '--yes'))).toContain('--department <slug> est obligatoire');
    expect(failure(() => grant(email, 'ADMIN', '--department', world.deptA.slug, '--yes'))).toContain("n'est accepté que pour DEPARTMENT_MANAGER");
    expect(failure(() => grant(email, 'DEPARTMENT_MANAGER', '--department', 'inconnu-xyz', '--yes'))).toContain('département inconnu');
  });

  it('staff:grant puis staff:revoke : deux départements, MFA supprimée seulement à la dernière révocation', { timeout: 120_000 }, async () => {
    const user = world.users.teacherB;

    expect(grant(user.email, 'DEPARTMENT_MANAGER', '--department', world.deptB.slug)).toContain('Simulation');
    expect(await prisma.staffAssignment.count({ where: { userId: user.id } })).toBe(0);

    grant(user.email, 'DEPARTMENT_MANAGER', '--department', world.deptB.slug, '--yes');
    grant(user.email, 'DEPARTMENT_MANAGER', '--department', world.deptA.slug, '--yes');
    expect(grant(user.email, 'DEPARTMENT_MANAGER', '--department', world.deptA.slug, '--yes')).toContain('Rien à faire');
    expect(await prisma.staffAssignment.count({ where: { userId: user.id, revokedAt: null } })).toBe(2);
    await prisma.staffMfa.upsert({ where: { userId: user.id }, create: { userId: user.id, secretCipher: 'fixture', enabledAt: new Date() }, update: {} });

    expect(revoke(user.email, 'DEPARTMENT_MANAGER', '--department', world.deptA.slug, '--yes')).toContain('double authentification est conservée');
    expect(await prisma.staffMfa.count({ where: { userId: user.id } })).toBe(1);
    expect(revoke(user.email, 'DEPARTMENT_MANAGER', '--department', world.deptB.slug, '--yes')).toContain('double authentification supprimée');
    expect(await prisma.staffMfa.count({ where: { userId: user.id } })).toBe(0);

    // Ré-attribution : la ligne révoquée est réactivée, pas dupliquée.
    grant(user.email, 'DEPARTMENT_MANAGER', '--department', world.deptB.slug, '--yes');
    expect(await prisma.staffAssignment.count({ where: { userId: user.id } })).toBe(2);
    await prisma.verificationToken.deleteMany({ where: { identifier: `staff-mfa-activation:${user.id}` } });
    await prisma.staffAssignment.deleteMany({ where: { userId: user.id } });
  });

  it('db:seed-demo-reading-lists : simulation, puis écriture idempotente, aucun compte créé', { timeout: 60_000 }, async () => {
    const usersBefore = await prisma.user.count();
    const run = (...args: string[]) => runTsScript('scripts/seed-demo-reading-lists.ts', args);
    const email = world.users.teacherA2.email;

    expect(run('--teacher', email)).toContain('Aucune écriture');
    expect(await prisma.readingList.count({ where: { ownerId: world.users.teacherA2.id, title: { startsWith: 'Démonstration' } } })).toBe(0);
    expect(run('--teacher', email, '--yes')).toContain('Créée');
    const second = run('--teacher', email, '--yes');
    expect(second).toContain('Complétée');
    expect(second).toContain('+0 ouvrage');
    expect(await prisma.readingList.count({ where: { ownerId: world.users.teacherA2.id, title: { startsWith: 'Démonstration' } } })).toBe(2);
    expect(failure(() => run('--teacher', world.users.student.email, '--yes'))).toContain("n'est pas enseignant");
    expect(failure(() => run('--teacher', 'personne@inconnu.local', '--yes'))).toContain('ne crée aucun compte');
    expect(await prisma.user.count()).toBe(usersBefore);
  });
});
