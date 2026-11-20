import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from './helpers/local-db';
import { STRUCTURE_TRANSACTION_OPTIONS, loadUlStructure } from '@/prisma/data/load-ul-structure';
import { createMemberVerificationIdentifier, createSecureToken, hashToken } from '@/lib/tokens';

// Les webhooks n'utilisent pas la session ; on neutralise Auth.js.
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
// Espion sur le chargement de l'index (implémentation réelle conservée).
vi.mock('@/lib/departments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/departments')>();
  return { ...actual, loadDepartmentIndex: vi.fn(actual.loadDepartmentIndex) };
});

const { loadDepartmentIndex } = await import('@/lib/departments');
const { POST: membersSync } = await import('@/app/api/members/sync/route');
const { POST: booksSync } = await import('@/app/api/books/sync/route');
const { POST: register } = await import('@/app/api/auth/register/route');
const { bookSelect } = await import('@/lib/books');

const suffix = randomUUID().slice(0, 8).toUpperCase();
const apiKey = `test-webhook-key-${suffix}`;
const originalKey = process.env.GEST_BIBLIO_API_KEY;
const startedAt = new Date();
const dept = new Map<string, string>();

const MEMBERS_RESPONSE_KEYS = ['created', 'updated', 'suspended', 'reactivated', 'roleUpdated', 'rejected', 'rejectedDetails'];
const NEW_KEYS = ['unresolvedDepartments', 'unresolvedDetails'];

function post(path: string, body: unknown, key = apiKey): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'x-forwarded-for': `198.51.100.${Math.floor(Math.random() * 200)}` },
    body: JSON.stringify(body),
  });
}

function member(matricule: string, extra: Record<string, unknown> = {}) {
  return { matricule, nom: 'Test', prenom: 'Webhook', dateNaissance: '2000-01-01', role: 'STUDENT', ...extra };
}

function book(externalId: string, department: string) {
  return {
    externalId,
    title: `Livre ${externalId}`,
    author: 'Auteur Test',
    isbn: `97800${Math.floor(Math.random() * 1e8)}`.slice(0, 13),
    department,
    category: 'Test',
  };
}

async function sync(members: unknown[]) {
  const response = await membersSync(post('/api/members/sync', { members }));
  return { status: response.status, body: await response.json() };
}

async function memberDept(matricule: string) {
  return (await prisma.libraryMember.findUniqueOrThrow({ where: { matricule } })).departmentId;
}

beforeAll(async () => {
  process.env.GEST_BIBLIO_API_KEY = apiKey;
  await prisma.$transaction((tx) => loadUlStructure(tx), STRUCTURE_TRANSACTION_OPTIONS);
  for (const d of await prisma.department.findMany()) dept.set(d.slug, d.id);
});

beforeEach(() => {
  vi.mocked(loadDepartmentIndex).mockClear();
});

afterAll(async () => {
  if (originalKey === undefined) delete process.env.GEST_BIBLIO_API_KEY;
  else process.env.GEST_BIBLIO_API_KEY = originalKey;

  await prisma.user.deleteMany({ where: { email: { endsWith: `-${suffix.toLowerCase()}@test.local` } } });
  await prisma.libraryMember.deleteMany({ where: { matricule: { contains: suffix } } });
  await prisma.book.deleteMany({ where: { externalId: { contains: suffix } } });
  await prisma.activityLog.deleteMany({
    where: { createdAt: { gte: startedAt }, action: { in: ['members.sync', 'book.sync.create', 'book.sync.update', 'book.sync.delete', 'auth.register'] } },
  });
  await prisma.rateLimitBucket.deleteMany({ where: { windowStart: { gte: new Date(startedAt.getTime() - 1000) } } });
});

describe('/api/members/sync : rattachement du département officiel', () => {
  it('nom officiel, alias, casse différente, libellé inconnu (accepté, null, signalé), absent', async () => {
    const m = (k: string) => `WH-${k}-${suffix}`;
    const { status, body } = await sync([
      member(m('OFF'), { departement: 'Mathématiques' }),
      member(m('ALI'), { departement: 'Maths' }),
      member(m('CAS'), { departement: '  INFORMATIQUE ' }),
      member(m('UNK'), { departement: 'Astronomie' }),
      member(m('ABS')),
    ]);

    expect(status).toBe(200);
    expect(body.data).toMatchObject({ created: 5, updated: 0, rejected: 0, unresolvedDepartments: 1 });
    expect(body.data.unresolvedDetails).toEqual([{ matricule: m('UNK'), value: 'Astronomie' }]);
    expect(await memberDept(m('OFF'))).toBe(dept.get('mathematiques'));
    expect(await memberDept(m('ALI'))).toBe(dept.get('mathematiques'));
    expect(await memberDept(m('CAS'))).toBe(dept.get('informatique'));
    expect(await memberDept(m('UNK'))).toBeNull();
    expect(await memberDept(m('ABS'))).toBeNull();
    // Le membre inconnu est bien enregistré avec son texte.
    expect((await prisma.libraryMember.findUniqueOrThrow({ where: { matricule: m('UNK') } })).departement).toBe('Astronomie');
  });

  it('mise à jour : departmentId suit le texte, le User lié suit (texte et id), y compris le retour à null', async () => {
    const matricule = `WH-USR-${suffix}`;
    await sync([member(matricule, { departement: 'Mathématiques' })]);
    const user = await prisma.user.create({
      data: {
        email: `wh-user-${suffix.toLowerCase()}@test.local`,
        username: `wh_user_${suffix}`,
        password: 'x',
        firstName: 'Web',
        lastName: 'Hook',
        status: 'ACTIVE',
        role: 'STUDENT',
        matricule,
        department: 'Mathématiques',
        departmentId: dept.get('mathematiques'),
      },
    });
    const linkedUser = () => prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    // Changement vers un autre département officiel.
    let result = await sync([member(matricule, { departement: 'Droit' })]);
    expect(result.body.data).toMatchObject({ updated: 1, unresolvedDepartments: 0, suspended: 0, roleUpdated: 0 });
    expect(await memberDept(matricule)).toBe(dept.get('droit'));
    expect(await linkedUser()).toMatchObject({ department: 'Droit', departmentId: dept.get('droit'), status: 'ACTIVE', role: 'STUDENT' });

    // Champ absent : texte conservé, rattachement recalculé à l'identique, rien ne bouge.
    result = await sync([member(matricule)]);
    expect(await memberDept(matricule)).toBe(dept.get('droit'));
    expect(await linkedUser()).toMatchObject({ department: 'Droit', departmentId: dept.get('droit') });

    // Libellé inconnu : id null pour le membre ET le User, texte recopié, cas signalé.
    result = await sync([member(matricule, { departement: 'Inconnu Z' })]);
    expect(result.body.data.unresolvedDetails).toEqual([{ matricule, value: 'Inconnu Z' }]);
    expect(await memberDept(matricule)).toBeNull();
    expect(await linkedUser()).toMatchObject({ department: 'Inconnu Z', departmentId: null });

    // Retour à un département officiel, puis vidage du département (null partout, non signalé).
    await sync([member(matricule, { departement: 'sciences du langage' })]);
    expect(await linkedUser()).toMatchObject({ department: 'sciences du langage', departmentId: dept.get('sciences-du-langage') });
    result = await sync([member(matricule, { departement: '' })]);
    expect(result.body.data.unresolvedDepartments).toBe(0);
    expect(await memberDept(matricule)).toBeNull();
    expect(await linkedUser()).toMatchObject({ department: '', departmentId: null, status: 'ACTIVE', role: 'STUDENT' });
  });

  it('lot de 200 membres : index chargé une seule fois', async () => {
    // 1 sur 2 inconnu : 100 cas signalés, détail plafonné aux 50 premiers.
    const labels = ['Informatique', 'Inconnu A', 'Physique', 'Inconnu B'];
    const members = Array.from({ length: 200 }, (_, i) => member(`WH-LOT-${i}-${suffix}`, { departement: labels[i % labels.length] }));

    const { body } = await sync(members);

    expect(loadDepartmentIndex).toHaveBeenCalledTimes(1);
    expect(body.data).toMatchObject({ created: 200, rejected: 0, unresolvedDepartments: 100 });
    expect(body.data.unresolvedDetails).toHaveLength(50);
    expect(body.data.unresolvedDetails[0]).toEqual({ matricule: `WH-LOT-1-${suffix}`, value: 'Inconnu A' });
    expect(await memberDept(`WH-LOT-0-${suffix}`)).toBe(dept.get('informatique'));
    expect(await memberDept(`WH-LOT-2-${suffix}`)).toBe(dept.get('physique-chimie'));
  }, 60_000);

  it('réponse : champs existants inchangés, seuls les 2 champs optionnels s’ajoutent ; décompte journalisé', async () => {
    const { status, body } = await sync([member(`WH-RSP-${suffix}`, { departement: 'Gestion' }), { matricule: '' }]);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('1 création(s), 0 mise(s) à jour, 0 suspension(s), 0 réactivation(s), 0 rôle(s) mis à jour, 1 rejet(s)');
    expect(Object.keys(body.data).sort()).toEqual([...MEMBERS_RESPONSE_KEYS, ...NEW_KEYS].sort());
    expect(body.data).toMatchObject({ created: 1, updated: 0, suspended: 0, reactivated: 0, roleUpdated: 0, rejected: 1 });
    expect(body.data.rejectedDetails).toHaveLength(1);

    const log = await prisma.activityLog.findFirstOrThrow({ where: { action: 'members.sync' }, orderBy: { createdAt: 'desc' } });
    expect(log.details).toMatchObject({ created: 1, rejected: 1, unresolvedDepartments: 0 });

    const unauthorized = await membersSync(post('/api/members/sync', { members: [] }, 'mauvaise-cle'));
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.json()).toEqual({ success: false, message: 'Clé API invalide' });
    expect((await membersSync(post('/api/members/sync', { members: [] }))).status).toBe(400);
  });
});

describe('/api/books/sync : rattachement du département officiel', () => {
  it('alias, casse, inconnu puis officiel ; réponse = livre inchangé + 2 champs ; DELETE inchangé', async () => {
    const externalId = `WH-BOOK-${suffix}`;
    const base = book(externalId, 'Physique');

    let response = await booksSync(post('/api/books/sync', { action: 'CREATE', book: base }));
    let body = await response.json();
    const bookId = () => prisma.book.findUniqueOrThrow({ where: { externalId } }).then((b) => b.departmentId);

    expect(response.status).toBe(200);
    expect(body.message).toBe('Livre synchronisé');
    expect(await bookId()).toBe(dept.get('physique-chimie'));
    const expectedBook = await prisma.book.findUniqueOrThrow({ where: { externalId }, select: bookSelect });
    expect(Object.keys(body.data).sort()).toEqual([...Object.keys(bookSelect), ...NEW_KEYS].sort());
    expect({ ...body.data, unresolvedDepartments: undefined, unresolvedDetails: undefined }).toEqual(
      JSON.parse(JSON.stringify({ ...expectedBook, unresolvedDepartments: undefined, unresolvedDetails: undefined }))
    );
    expect(body.data).toMatchObject({ unresolvedDepartments: 0, unresolvedDetails: [] });

    response = await booksSync(post('/api/books/sync', { action: 'UPDATE', book: { ...base, department: 'Médecine' } }));
    body = await response.json();
    expect(body.message).toBe('Livre mis à jour');
    expect(body.data.department).toBe('Médecine');
    expect(body.data).toMatchObject({ unresolvedDepartments: 1, unresolvedDetails: [{ externalId, value: 'Médecine' }] });
    expect(await bookId()).toBeNull();

    await booksSync(post('/api/books/sync', { action: 'UPDATE', book: { ...base, department: 'DROIT' } }));
    expect(await bookId()).toBe(dept.get('droit'));

    const log = await prisma.activityLog.findFirstOrThrow({ where: { action: 'book.sync.update' }, orderBy: { createdAt: 'desc' } });
    expect(log.details).toEqual({ externalId, isbn: base.isbn, unresolvedDepartments: 0 });

    response = await booksSync(post('/api/books/sync', { action: 'DELETE', book: base }));
    body = await response.json();
    expect(body.message).toBe('Livre supprimé');
    expect(Object.keys(body.data).sort()).toEqual(Object.keys(bookSelect).sort());
  });
});

describe('/api/auth/register : copie du département officiel', () => {
  it('copie departmentId depuis LibraryMember, réponse inchangée', async () => {
    const matricule = `WH-REG-${suffix}`;
    await sync([member(matricule, { departement: 'Département de Géographie' })]);
    const token = createSecureToken();
    await prisma.verificationToken.create({
      data: { identifier: createMemberVerificationIdentifier(matricule), token: hashToken(token), expires: new Date(Date.now() + 600_000) },
    });

    const response = await register(
      post('/api/auth/register', {
        matricule,
        verificationToken: token,
        email: `wh-reg-${suffix.toLowerCase()}@test.local`,
        username: `wh_reg_${suffix}`,
        password: 'Inscription1234',
        confirmPassword: 'Inscription1234',
      })
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(Object.keys(body.data).sort()).toEqual(
      ['createdAt', 'department', 'email', 'firstName', 'id', 'lastName', 'libraryCard', 'photo', 'role', 'status', 'username'].sort()
    );
    const user = await prisma.user.findUniqueOrThrow({ where: { id: body.data.id } });
    expect(user).toMatchObject({ department: 'Département de Géographie', departmentId: dept.get('geographie') });
  });
});
