import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { prisma } from './helpers/local-db';
import { cleanupWorld, createWorld, jsonRequest, params, proofFor, sessionFor, type Profile, type World } from './helpers/department-fixtures';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
const jar = vi.hoisted(() => ({ proof: undefined as string | undefined }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => (jar.proof ? { value: jar.proof } : undefined) }) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => '/personnel/acquisitions',
}));

const { auth } = await import('@/lib/auth');
const { SELF_DECISION_MESSAGE, evaluateAcquisitionDecision } = await import('@/lib/acquisitions');
const { departmentActorFrom } = await import('@/lib/department-access');
const { POST: propose } = await import('@/app/api/teacher/acquisitions/route');
const { DELETE: withdraw } = await import('@/app/api/teacher/acquisitions/[id]/route');
const { PATCH: decide } = await import('@/app/api/staff/acquisitions/[id]/route');
const { default: DeptProposals } = await import('@/app/(staff)/personnel/(protected)/departement/propositions/page');
const { default: LibraryQueue } = await import('@/app/(staff)/personnel/(protected)/acquisitions/page');

const authMock = vi.mocked(auth as unknown as (...args: unknown[]) => Promise<unknown>);
const startedAt = new Date();
let world: World;
let managerA2: string;

function asId(id: string): void {
  jar.proof = proofFor(id);
  authMock.mockResolvedValue(sessionFor(id));
}
const as = (profile: Profile) => asId(world.users[profile].id);
const read = async (response: Response) => ({ status: response.status, body: await response.json() });
const decision = async (id: string, body: unknown) => read(await decide(jsonRequest('PATCH', body), params({ id })));
const html = (value: unknown) => renderToStaticMarkup(value as ReactElement);

async function requestBy(requesterId: string, status: 'SUBMITTED' | 'DEPT_APPROVED' | 'LIBRARY_ACCEPTED', dept: 'A' | 'B' = 'A') {
  return prisma.acquisitionRequest.create({
    data: {
      requesterId,
      departmentId: dept === 'A' ? world.deptA.id : world.deptB.id,
      title: `Auto ${status} ${Math.random().toString(36).slice(2, 7)}`,
      author: 'Auteur',
      justification: 'Justification suffisante',
      status,
    },
  });
}

const denialLogs = (requestId: string) =>
  prisma.activityLog.findMany({ where: { action: 'acquisition.self_decision_denied', details: { path: ['requestId'], equals: requestId } } });

beforeAll(async () => {
  world = await createWorld(1);
  // Second responsable du département A (enseignant en base, MFA de fixture).
  const user = await prisma.user.create({
    data: { email: `rl-managera2-${world.suffix}@test.local`, username: `rl_managera2_${world.suffix}`, password: 'x', firstName: 'Second', lastName: 'Responsable', role: 'TEACHER', status: 'ACTIVE', departmentId: world.deptA.id },
  });
  managerA2 = user.id;
  await prisma.staffAssignment.create({ data: { userId: managerA2, role: 'DEPARTMENT_MANAGER', departmentId: world.deptA.id } });
  await prisma.staffMfa.create({ data: { userId: managerA2, secretCipher: 'fixture', enabledAt: new Date(Date.now() - 60_000) } });
});

beforeEach(() => {
  authMock.mockReset();
  jar.proof = undefined;
});

afterAll(async () => {
  await prisma.activityLog.deleteMany({ where: { userId: managerA2 } });
  await prisma.notification.deleteMany({ where: { userId: managerA2 } });
  await prisma.staffAssignment.deleteMany({ where: { userId: managerA2 } });
  await prisma.staffMfa.deleteMany({ where: { userId: managerA2 } });
  await prisma.user.deleteMany({ where: { id: managerA2 } });
  await cleanupWorld(world, startedAt);
});

describe('règle pure', () => {
  it('le demandeur est refusé à chaque étape, quel que soit son rôle', () => {
    const manager = departmentActorFrom('moi', [{ role: 'DEPARTMENT_MANAGER', departmentId: 'A' }]);
    const admin = departmentActorFrom('moi', [{ role: 'ADMIN', departmentId: null }]);

    for (const [actor, status, action] of [
      [manager, 'SUBMITTED', 'approve'],
      [manager, 'SUBMITTED', 'reject'],
      [admin, 'SUBMITTED', 'approve'],
      [admin, 'DEPT_APPROVED', 'accept'],
      [admin, 'DEPT_APPROVED', 'refuse'],
      [admin, 'LIBRARY_ACCEPTED', 'acquired'],
    ] as const) {
      expect(evaluateAcquisitionDecision(actor, { departmentId: 'A', status, requesterId: 'moi' }, action)).toEqual({
        allowed: false,
        httpStatus: 403,
        message: SELF_DECISION_MESSAGE,
        selfDecision: true,
      });
    }
  });

  it('autre département : 404 avant tout (l’existence n’est pas révélée)', () => {
    const manager = departmentActorFrom('moi', [{ role: 'DEPARTMENT_MANAGER', departmentId: 'A' }]);

    expect(evaluateAcquisitionDecision(manager, { departmentId: 'B', status: 'SUBMITTED', requesterId: 'moi' }, 'approve')).toMatchObject({ httpStatus: 404 });
  });
});

describe('API : auto-validation interdite', () => {
  it('responsable-enseignant : propose puis tente de valider → 403 journalisé ; un autre responsable valide', async () => {
    as('managerA');
    const created = await read(await propose(jsonRequest('POST', { title: `Propre ${world.suffix}`, author: 'Auteur', justification: 'Indispensable au cours de L2' })));
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;

    const self = await decision(id, { action: 'approve' });
    expect(self).toEqual({ status: 403, body: { success: false, message: SELF_DECISION_MESSAGE } });
    expect((await decision(id, { action: 'reject', note: 'Refus de ma propre demande' })).status).toBe(403);
    expect((await prisma.acquisitionRequest.findUniqueOrThrow({ where: { id } })).status).toBe('SUBMITTED');

    const logs = await denialLogs(id);
    expect(logs).toHaveLength(2);
    expect(logs[0].userId).toBe(world.users.managerA.id);
    expect(Object.keys(logs[0].details as object).sort()).toEqual(['attempted', 'requestId']);

    asId(managerA2);
    expect((await decision(id, { action: 'approve' })).status).toBe(200);
  });

  it('bibliothécaire demandeur : ne peut pas accepter sa proposition ; un administrateur le peut', async () => {
    const own = await requestBy(world.users.librarian.id, 'DEPT_APPROVED');

    as('librarian');
    expect((await decision(own.id, { action: 'accept' })).status).toBe(403);
    expect((await decision(own.id, { action: 'refuse', note: 'Motif suffisant' })).status).toBe(403);

    as('admin');
    expect((await decision(own.id, { action: 'accept' })).status).toBe(200);
  });

  it('administrateur demandeur : ni substitution, ni acceptation, ni « acquis » sur la sienne ; décide celles des autres', async () => {
    const submitted = await requestBy(world.users.admin.id, 'SUBMITTED');
    const accepted = await requestBy(world.users.admin.id, 'LIBRARY_ACCEPTED');
    const others = await requestBy(world.users.requesterA.id, 'DEPT_APPROVED');

    as('admin');
    expect((await decision(submitted.id, { action: 'approve' })).status).toBe(403);
    expect((await decision(accepted.id, { action: 'acquired' })).status).toBe(403);
    expect((await decision(others.id, { action: 'accept' })).status).toBe(200);

    as('librarian');
    expect((await decision(accepted.id, { action: 'acquired' })).status).toBe(200);
  });

  it('substitution toujours permise pour la proposition d’un autre (journalisée comme telle)', async () => {
    const other = await requestBy(world.users.requesterA.id, 'SUBMITTED');

    as('librarian');
    expect((await decision(other.id, { action: 'approve' })).status).toBe(200);
    const log = await prisma.activityLog.findFirst({ where: { action: 'acquisition.dept_approved', details: { path: ['requestId'], equals: other.id } } });
    expect(log?.details).toMatchObject({ substitute: true });
  });

  it('le demandeur peut toujours retirer sa proposition SUBMITTED', async () => {
    const own = await requestBy(world.users.managerA.id, 'SUBMITTED');

    as('managerA');
    expect((await withdraw(jsonRequest('DELETE'), params({ id: own.id }))).status).toBe(200);
    expect(await prisma.acquisitionRequest.count({ where: { id: own.id } })).toBe(0);
  });
});

describe('pages : boutons remplacés pour sa propre proposition', () => {
  it('responsable de département : texte pour la sienne, boutons pour celle d’un autre', async () => {
    const own = await requestBy(world.users.managerA.id, 'SUBMITTED');
    const other = await requestBy(world.users.requesterA.id, 'SUBMITTED');

    as('managerA');
    const markup = html(await DeptProposals({ searchParams: Promise.resolve({ departement: world.deptA.slug }) }));
    const block = (title: string) => markup.slice(markup.indexOf(title), markup.indexOf('</li>', markup.indexOf(title)));

    expect(block(own.title)).toContain(SELF_DECISION_MESSAGE);
    expect(block(own.title)).not.toContain('Valider et transmettre');
    expect(block(other.title)).toContain('Valider et transmettre');
    expect(block(other.title)).not.toContain(SELF_DECISION_MESSAGE);
  });

  it('bibliothécaire : texte pour la sienne, boutons pour celle d’un autre', async () => {
    const own = await requestBy(world.users.librarian.id, 'DEPT_APPROVED');
    const other = await requestBy(world.users.requesterB.id, 'DEPT_APPROVED', 'B');

    as('librarian');
    const markup = html(await LibraryQueue({ searchParams: Promise.resolve({}) }));
    const block = (title: string) => markup.slice(markup.indexOf(title), markup.indexOf('</li>', markup.indexOf(title)));

    expect(block(own.title)).toContain(SELF_DECISION_MESSAGE);
    expect(block(own.title)).not.toContain('Accepter');
    expect(block(other.title)).toContain('Accepter');
  });
});
