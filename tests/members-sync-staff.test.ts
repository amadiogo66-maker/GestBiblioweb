import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from './helpers/local-db';

// La route de synchronisation n'utilise pas la session ; on neutralise Auth.js.
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

const API_DIR = join(process.cwd(), 'app', 'api');

function syncRouteFiles(): string[] {
  return readdirSync(API_DIR, { recursive: true, encoding: 'utf8' })
    .filter((path) => /(^|[\\/])sync[\\/]route\.ts$/.test(path))
    .map((path) => join(API_DIR, path));
}

describe('webhooks de synchronisation : aucune référence au personnel', () => {
  it('aucune route */sync ne mentionne StaffAssignment ni StaffRole', () => {
    const files = syncRouteFiles();

    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const file of files) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/staffAssignment|StaffAssignment|StaffRole/);
    }
  });
});

describe('/api/members/sync ne touche jamais StaffAssignment (base locale)', () => {
  const suffix = randomUUID().slice(0, 8);
  const matricule = `TEST-STAFF-${suffix}`;
  const newMatricule = `TEST-NEW-${suffix}`;
  const apiKey = `test-sync-key-${suffix}`;
  const originalKey = process.env.GEST_BIBLIO_API_KEY;
  const startedAt = new Date();
  let userId = '';
  let granterId = '';

  beforeAll(async () => {
    process.env.GEST_BIBLIO_API_KEY = apiKey;

    await prisma.libraryMember.create({
      data: { matricule, nom: 'Test', prenom: 'Staff', dateNaissance: new Date('2000-01-01'), role: 'STUDENT' },
    });
    const user = await prisma.user.create({
      data: {
        email: `staff-${suffix}@test.local`,
        username: `staff_${suffix}`,
        password: 'x',
        firstName: 'Staff',
        lastName: 'Test',
        status: 'ACTIVE',
        matricule,
      },
    });
    const granter = await prisma.user.create({
      data: {
        email: `granter-${suffix}@test.local`,
        username: `granter_${suffix}`,
        password: 'x',
        firstName: 'Granter',
        lastName: 'Test',
        status: 'ACTIVE',
      },
    });
    userId = user.id;
    granterId = granter.id;

    await prisma.staffAssignment.createMany({
      data: [
        { userId, role: 'ADMIN', grantedById: granterId },
        { userId, role: 'LIBRARIAN', revokedAt: new Date('2026-01-01') },
      ],
    });
  });

  afterAll(async () => {
    if (originalKey === undefined) delete process.env.GEST_BIBLIO_API_KEY;
    else process.env.GEST_BIBLIO_API_KEY = originalKey;

    await prisma.staffAssignment.deleteMany({ where: { userId: { in: [userId, granterId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, granterId] } } });
    await prisma.libraryMember.deleteMany({ where: { matricule: { in: [matricule, newMatricule] } } });
    await prisma.activityLog.deleteMany({ where: { action: 'members.sync', createdAt: { gte: startedAt } } });
  });

  it('change rôle et statut du User, mais aucune affectation du personnel', async () => {
    const before = await prisma.staffAssignment.findMany({ orderBy: { id: 'asc' } });
    const { POST } = await import('@/app/api/members/sync/route');

    const response = await POST(
      new NextRequest('http://localhost/api/members/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({
          members: [
            { matricule, nom: 'Test', prenom: 'Staff', dateNaissance: '2000-01-01', role: 'TEACHER', inscriptionActive: false },
            { matricule: newMatricule, nom: 'Nouveau', prenom: 'Membre', dateNaissance: '2001-02-03', role: 'STUDENT' },
          ],
        }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({ created: 1, updated: 1, suspended: 1, roleUpdated: 1, rejected: 0 });

    // La synchronisation a bien agi sur le User…
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.role).toBe('TEACHER');
    expect(user.status).toBe('SUSPENDED');

    // …sans créer, modifier ni supprimer la moindre affectation.
    const after = await prisma.staffAssignment.findMany({ orderBy: { id: 'asc' } });
    expect(after).toEqual(before);
  });
});
