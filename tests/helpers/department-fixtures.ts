import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import type { StaffRole, UserRole, UserStatus } from '@prisma/client';
import { prisma } from './local-db';
import { createMfaProof } from '@/lib/staff-mfa';

/**
 * Jeu de données des tests listes de lectures / acquisitions : deux départements
 * de test (A et B), un programme, des ouvrages, et un compte par profil de la
 * matrice d'accès. Tout est préfixé et supprimé par cleanupWorld().
 */

export type Profile =
  | 'student'
  | 'teacherNoDept'
  | 'teacherA'
  | 'teacherA2'
  | 'teacherB'
  | 'managerA'
  | 'managerB'
  | 'librarian'
  | 'admin'
  | 'revokedManager'
  | 'suspendedManager'
  | 'jwtLiar'
  | 'requesterA'
  | 'requesterB';

export interface World {
  suffix: string;
  facultyId: string;
  deptA: { id: string; slug: string };
  deptB: { id: string; slug: string };
  programA: string;
  books: string[];
  users: Record<Profile, { id: string; email: string; firstName: string }>;
}

interface ProfileSpec {
  role: UserRole;
  status: UserStatus;
  dept: 'A' | 'B' | null;
  staff?: Array<{ role: StaffRole; dept?: 'A' | 'B'; revoked?: boolean }>;
}

const PROFILES: Record<Profile, ProfileSpec> = {
  student: { role: 'STUDENT', status: 'ACTIVE', dept: 'A' },
  teacherNoDept: { role: 'TEACHER', status: 'ACTIVE', dept: null },
  teacherA: { role: 'TEACHER', status: 'ACTIVE', dept: 'A' },
  teacherA2: { role: 'TEACHER', status: 'ACTIVE', dept: 'A' },
  teacherB: { role: 'TEACHER', status: 'ACTIVE', dept: 'B' },
  managerA: { role: 'TEACHER', status: 'ACTIVE', dept: 'A', staff: [{ role: 'DEPARTMENT_MANAGER', dept: 'A' }] },
  managerB: { role: 'TEACHER', status: 'ACTIVE', dept: 'B', staff: [{ role: 'DEPARTMENT_MANAGER', dept: 'B' }] },
  librarian: { role: 'STUDENT', status: 'ACTIVE', dept: null, staff: [{ role: 'LIBRARIAN' }] },
  admin: { role: 'STUDENT', status: 'ACTIVE', dept: null, staff: [{ role: 'ADMIN' }] },
  revokedManager: { role: 'TEACHER', status: 'ACTIVE', dept: 'A', staff: [{ role: 'DEPARTMENT_MANAGER', dept: 'A', revoked: true }] },
  suspendedManager: { role: 'TEACHER', status: 'SUSPENDED', dept: 'A', staff: [{ role: 'DEPARTMENT_MANAGER', dept: 'A' }] },
  // Le JWT prétendra TEACHER + personnel : en base, étudiant sans affectation.
  jwtLiar: { role: 'STUDENT', status: 'ACTIVE', dept: 'A' },
  // Auteurs des propositions de fixture (n'entament pas les quotas des autres profils).
  requesterA: { role: 'TEACHER', status: 'ACTIVE', dept: 'A' },
  requesterB: { role: 'TEACHER', status: 'ACTIVE', dept: 'B' },
};

export async function createWorld(bookCount = 6): Promise<World> {
  const suffix = randomUUID().slice(0, 8);
  const faculty = await prisma.faculty.create({ data: { slug: `test-fac-${suffix}`, name: `Faculté test ${suffix}`, sortOrder: 999 } });
  const makeDept = (key: string) =>
    prisma.department.create({ data: { slug: `test-dept-${key}-${suffix}`, name: `Département ${key.toUpperCase()} ${suffix}`, facultyId: faculty.id, sortOrder: 999 }, select: { id: true, slug: true } });
  const deptA = await makeDept('a');
  const deptB = await makeDept('b');
  const program = await prisma.program.create({
    data: { slug: `test-prog-${suffix}`, name: `Licence test ${suffix}`, level: 'LICENCE', departmentId: deptA.id, sortOrder: 1 },
  });
  await prisma.book.createMany({
    data: Array.from({ length: bookCount }, (_, i) => ({
      externalId: `TEST-RL-${suffix}-${i}`,
      isbn: `97800${suffix.replace(/[^0-9]/g, '1').slice(0, 4).padEnd(4, '1')}${String(i).padStart(4, '0')}`,
      title: `Livre test ${suffix} n°${i}`,
      author: 'Auteur Test',
      department: 'Test',
      category: 'Test',
      departmentId: deptA.id,
    })),
  });
  const books = (await prisma.book.findMany({ where: { externalId: { startsWith: `TEST-RL-${suffix}-` } }, orderBy: { externalId: 'asc' }, select: { id: true } })).map((b) => b.id);

  const users = {} as World['users'];
  for (const [name, spec] of Object.entries(PROFILES) as Array<[Profile, ProfileSpec]>) {
    const lower = name.toLowerCase();
    const user = await prisma.user.create({
      data: {
        email: `rl-${lower}-${suffix}@test.local`,
        username: `rl_${lower}_${suffix}`,
        password: 'x',
        firstName: `Prenom${name}${suffix}`,
        lastName: 'Test',
        role: spec.role,
        status: spec.status,
        departmentId: spec.dept === 'A' ? deptA.id : spec.dept === 'B' ? deptB.id : null,
      },
    });
    users[name] = { id: user.id, email: user.email, firstName: user.firstName };

    for (const assignment of spec.staff ?? []) {
      await prisma.staffAssignment.create({
        data: {
          userId: user.id,
          role: assignment.role,
          departmentId: assignment.dept === 'A' ? deptA.id : assignment.dept === 'B' ? deptB.id : null,
          revokedAt: assignment.revoked ? new Date() : null,
        },
      });
    }

    if (spec.staff) {
      await prisma.staffMfa.create({ data: { userId: user.id, secretCipher: 'fixture', enabledAt: new Date(Date.now() - 60_000) } });
    }
  }

  return { suffix, facultyId: faculty.id, deptA, deptB, programA: program.id, books, users };
}

export async function cleanupWorld(world: World | undefined, startedAt: Date): Promise<void> {
  if (!world) return;
  const ids = Object.values(world.users).map((user) => user.id);
  const deptIds = [world.deptA.id, world.deptB.id];

  await prisma.readingList.deleteMany({ where: { OR: [{ ownerId: { in: ids } }, { departmentId: { in: deptIds } }] } });
  await prisma.acquisitionRequest.deleteMany({ where: { OR: [{ requesterId: { in: ids } }, { departmentId: { in: deptIds } }] } });
  await prisma.loan.deleteMany({ where: { userId: { in: ids } } });
  await prisma.reservation.deleteMany({ where: { userId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.activityLog.deleteMany({ where: { OR: [{ userId: { in: ids } }, { createdAt: { gte: startedAt }, action: { startsWith: 'reading_list.' } }, { createdAt: { gte: startedAt }, action: { startsWith: 'acquisition.' } }] } });
  await prisma.staffAssignment.deleteMany({ where: { OR: [{ userId: { in: ids } }, { departmentId: { in: deptIds } }] } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.book.deleteMany({ where: { externalId: { startsWith: `TEST-RL-${world.suffix}-` } } });
  await prisma.program.deleteMany({ where: { departmentId: { in: deptIds } } });
  await prisma.department.deleteMany({ where: { id: { in: deptIds } } });
  await prisma.faculty.deleteMany({ where: { id: world.facultyId } });
  await prisma.rateLimitBucket.deleteMany({ where: { windowStart: { gte: new Date(startedAt.getTime() - 60 * 60 * 1000) } } });
}

/** Session simulée (le JWT peut prétendre n'importe quoi : seule la base fait foi). */
export function sessionFor(id: string | null, claims: Record<string, unknown> = {}) {
  return id ? { user: { id, status: 'ACTIVE', role: 'TEACHER', ...claims }, expires: '2099-01-01' } : null;
}

export const proofFor = (id: string): string => createMfaProof(id, 1);

let ip = 0;
export function jsonRequest(method: string, body?: unknown, options: { origin?: string | null } = {}): NextRequest {
  ip += 1;
  const headers: Record<string, string> = { host: 'localhost', 'content-type': 'application/json', 'x-forwarded-for': `198.19.${Math.floor(ip / 250)}.${(ip % 250) + 1}` };
  const origin = options.origin === undefined ? 'http://localhost' : options.origin;
  if (origin) headers.origin = origin;
  return new NextRequest('http://localhost/api/test', { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

export const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

/** Cible d'une redirection ou d'un notFound() levés par une page. */
export async function pageOutcome(render: () => Promise<unknown>): Promise<{ kind: 'render' | 'redirect' | 'notFound'; target?: string; value?: unknown }> {
  try {
    return { kind: 'render', value: await render() };
  } catch (error) {
    const digest = (error as { digest?: string }).digest ?? '';
    if (digest.includes('NEXT_HTTP_ERROR_FALLBACK;404')) return { kind: 'notFound' };
    if (digest.startsWith('NEXT_REDIRECT')) return { kind: 'redirect', target: digest.split(';')[2] };
    throw error;
  }
}
