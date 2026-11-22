import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from './helpers/local-db';
import { runTsScript } from './helpers/run-script';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
// Implémentation réelle, avec possibilité de provoquer un échec d'écriture.
const eventFailure = vi.hoisted(() => ({ enabled: false }));
vi.mock('@/lib/site-events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/site-events')>();
  return {
    ...actual,
    recordSiteEvent: vi.fn(async (...args: Parameters<typeof actual.recordSiteEvent>) => {
      if (eventFailure.enabled) throw new Error('échec simulé');
      return actual.recordSiteEvent(...args);
    }),
  };
});

const { auth } = await import('@/lib/auth');
const { recordSiteEvent } = await import('@/lib/site-events');
const { evaluateReservationTransition } = await import('@/lib/circulation');
const { createMemberVerificationIdentifier, createSecureToken, hashToken } = await import('@/lib/tokens');
const { POST: loansSync } = await import('@/app/api/loans/sync/route');
const { POST: reservationsSync } = await import('@/app/api/reservations/sync/route');
const { GET: eventsGet } = await import('@/app/api/events/route');
const { POST: eventsAck } = await import('@/app/api/events/ack/route');
const { POST: reservationPost } = await import('@/app/api/reservations/route');
const { PATCH: reservationCancel } = await import('@/app/api/reservations/[id]/cancel/route');
const { PATCH: renew } = await import('@/app/api/loans/[id]/renew/route');
const { POST: register } = await import('@/app/api/auth/register/route');
const { POST: booksSync } = await import('@/app/api/books/sync/route');

const suffix = randomUUID().slice(0, 8).toUpperCase();
const apiKey = `test-circulation-${suffix}`;
const originalKey = process.env.GEST_BIBLIO_API_KEY;
const startedAt = new Date();
const authMock = vi.mocked(auth as unknown as (...args: unknown[]) => Promise<unknown>);
const userIds: string[] = [];
let baselineSeq = 0;
let counter = 0;
let bookA = { id: '', externalId: `CIRC-BOOK-A-${suffix}` };
let bookB = { id: '', externalId: `CIRC-BOOK-B-${suffix}` };
let memberWithAccount = `CIRC-M1-${suffix}`;
const memberNoAccount = `CIRC-M2-${suffix}`;
let accountId = '';

const uid = (prefix: string): string => {
  counter += 1;
  return `${prefix}-${counter}-${suffix}`;
};

function webhook(url: string, body: unknown, key: string | null = apiKey): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (key) headers['x-api-key'] = key;
  return new NextRequest(`http://localhost${url}`, { method: 'POST', headers, body: JSON.stringify(body) });
}

function site(method: string, body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/site', {
    method,
    headers: { host: 'localhost', origin: 'http://localhost', 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const json = async (response: Response) => ({ status: response.status, body: await response.json() });
const syncLoans = async (loans: unknown[]) => json(await loansSync(webhook('/api/loans/sync', { loans })));
const syncReservations = async (updates: unknown[]) => json(await reservationsSync(webhook('/api/reservations/sync', { updates })));
const readEvents = async (query = `after=${baselineSeq}`, key: string | null = apiKey) => {
  const headers: Record<string, string> = key ? { 'x-api-key': key } : {};
  return json(await eventsGet(new NextRequest(`http://localhost/api/events?${query}`, { headers })));
};
const ack = async (body: unknown) => json(await eventsAck(webhook('/api/events/ack', body)));
const params = (id: string) => ({ params: Promise.resolve({ id }) });

function loan(overrides: Record<string, unknown> = {}) {
  return {
    externalId: uid('CIRC-LOAN'),
    matricule: memberWithAccount,
    bookExternalId: bookA.externalId,
    borrowDate: '2026-11-01T09:00:00.000Z',
    dueDate: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    ...overrides,
  };
}

function as(id: string, matricule?: string): void {
  authMock.mockResolvedValue({ user: { id, status: 'ACTIVE', matricule }, expires: '2099-01-01' });
}

async function ackAll(): Promise<void> {
  await prisma.siteEvent.updateMany({ where: { seq: { gt: baselineSeq }, processedAt: null }, data: { processedAt: new Date() } });
}

async function freshReservation(status: 'PENDING' | 'READY' | 'FULFILLED' | 'EXPIRED' | 'CANCELLED'): Promise<string> {
  const row = await prisma.reservation.create({ data: { userId: accountId, bookId: bookB.id, status } });
  return row.id;
}

beforeAll(async () => {
  process.env.GEST_BIBLIO_API_KEY = apiKey;
  baselineSeq = (await prisma.siteEvent.aggregate({ _max: { seq: true } }))._max.seq ?? 0;
  const makeBook = (externalId: string, isbn: string) =>
    prisma.book.create({
      data: { externalId, isbn, title: externalId, author: 'Test', department: 'Informatique', category: 'Test', totalCopies: 3, availableCopies: 3, status: 'AVAILABLE', loanCount: 7 },
    });
  bookA = await makeBook(bookA.externalId, `CA-${suffix}`);
  bookB = await makeBook(bookB.externalId, `CB-${suffix}`);
  await prisma.libraryMember.createMany({
    data: [memberWithAccount, memberNoAccount].map((matricule) => ({ matricule, nom: 'Secretnom', prenom: 'Secretprenom', dateNaissance: new Date('2000-01-01') })),
  });
  const user = await prisma.user.create({
    data: {
      email: `circ-${suffix.toLowerCase()}@test.local`,
      username: `circ_${suffix}`,
      password: 'x',
      firstName: 'Secretprenom',
      lastName: 'Secretnom',
      status: 'ACTIVE',
      matricule: memberWithAccount,
    },
  });
  accountId = user.id;
  userIds.push(user.id);
});

beforeEach(() => {
  authMock.mockReset();
  eventFailure.enabled = false;
  vi.mocked(recordSiteEvent).mockClear();
});

afterAll(async () => {
  if (originalKey === undefined) delete process.env.GEST_BIBLIO_API_KEY;
  else process.env.GEST_BIBLIO_API_KEY = originalKey;
  await prisma.siteEvent.deleteMany({ where: { seq: { gt: baselineSeq } } });
  await prisma.loan.deleteMany({ where: { OR: [{ externalId: { contains: suffix } }, { externalId: { startsWith: 'DEMO-' } }, { userId: { in: userIds } }] } });
  await prisma.reservation.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.activityLog.deleteMany({
    where: {
      OR: [
        { userId: { in: userIds } },
        { action: { in: ['loans.sync', 'reservations.sync', 'events.read', 'events.ack', 'book.sync.update', 'book.sync.create'] }, createdAt: { gte: startedAt } },
      ],
    },
  });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.libraryMember.deleteMany({ where: { matricule: { contains: suffix } } });
  await prisma.book.deleteMany({ where: { externalId: { contains: suffix } } });
  await prisma.rateLimitBucket.deleteMany({ where: { windowStart: { gte: new Date(startedAt.getTime() - 1000) } } });
});

describe('authentification des nouvelles routes', () => {
  const routes: Array<[string, (key: string | null) => Promise<Response>]> = [
    ['loans/sync', (key) => loansSync(webhook('/api/loans/sync', { loans: [{}] }, key))],
    ['reservations/sync', (key) => reservationsSync(webhook('/api/reservations/sync', { updates: [{}] }, key))],
    ['events', (key) => eventsGet(new NextRequest('http://localhost/api/events', { headers: key ? { 'x-api-key': key } : {} }))],
    ['events/ack', (key) => eventsAck(webhook('/api/events/ack', { upToSeq: 1 }, key))],
  ];

  it.each(routes)('%s : 401 sans clé ou clé fausse, 500 si non configurée', async (_name, call) => {
    expect(await json(await call(null))).toEqual({ status: 401, body: { success: false, message: 'Clé API invalide' } });
    expect((await call('mauvaise-cle')).status).toBe(401);

    delete process.env.GEST_BIBLIO_API_KEY;
    const unconfigured = await json(await call(apiKey));
    process.env.GEST_BIBLIO_API_KEY = apiKey;
    expect(unconfigured).toEqual({ status: 500, body: { success: false, message: 'Synchronisation indisponible' } });
  });
});

describe('POST /api/loans/sync', () => {
  it('enveloppe invalide → 400', async () => {
    expect((await json(await loansSync(webhook('/api/loans/sync', {})))).status).toBe(400);
    expect((await syncLoans([])).status).toBe(400);
    expect((await syncLoans(Array.from({ length: 1001 }, () => ({})))).status).toBe(400);
  });

  it('lot partiel : les valides passent, chaque rejet est motivé', async () => {
    const good = loan();
    const items = [
      good,
      loan({ matricule: 'INCONNU' }),
      loan({ bookExternalId: 'LIVRE-INCONNU' }),
      loan({ status: 'RETURNED' }),
      loan({ dueDate: '2026-10-01T00:00:00.000Z' }),
      { externalId: 'INVALIDE' },
    ];
    const { status, body } = await syncLoans(items);

    expect(status).toBe(200);
    expect(body.data).toMatchObject({ created: 1, updated: 0, rejected: 5, linked: 1, unlinked: 0, warnings: [] });
    expect(body.data.rejectedDetails.map((row: { index: number }) => row.index)).toEqual([1, 2, 3, 4, 5]);
    expect(body.data.rejectedDetails[0]).toMatchObject({ externalId: items[1].externalId, reason: 'Membre inconnu' });
    expect(body.data.rejectedDetails[1].reason).toBe('Livre inconnu');
    expect(body.data.rejectedDetails[2].reason).toMatch(/RETURNED/);
    expect(body.data.rejectedDetails[3].reason).toMatch(/échéance/);
    expect(await prisma.loan.count({ where: { externalId: { in: items.slice(1, 5).map((item) => item.externalId as string) } } })).toBe(0);
  });

  it('idempotent : rejouer deux fois donne la même ligne', async () => {
    const item = loan({ renewalCount: 1, fineAmount: 1500.5 });
    expect((await syncLoans([item])).body.data).toMatchObject({ created: 1, updated: 0 });
    const first = await prisma.loan.findUniqueOrThrow({ where: { externalId: item.externalId as string } });
    expect((await syncLoans([item])).body.data).toMatchObject({ created: 0, updated: 1 });
    const second = await prisma.loan.findUniqueOrThrow({ where: { externalId: item.externalId as string } });

    expect(second).toEqual(first);
    expect(await prisma.loan.count({ where: { externalId: item.externalId as string } })).toBe(1);
  });

  it('rattachement : userId si le compte existe, sinon prêt orphelin avec matricule', async () => {
    const withAccount = loan();
    const orphan = loan({ matricule: memberNoAccount });
    const { body } = await syncLoans([withAccount, orphan]);

    expect(body.data).toMatchObject({ linked: 1, unlinked: 1 });
    expect(await prisma.loan.findUnique({ where: { externalId: withAccount.externalId as string } })).toMatchObject({ userId: accountId, matricule: memberWithAccount });
    expect(await prisma.loan.findUnique({ where: { externalId: orphan.externalId as string } })).toMatchObject({ userId: null, matricule: memberNoAccount });
  });

  it('statut par défaut : RETURNED si returnDate, sinon ACTIVE', async () => {
    const returned = loan({ returnDate: '2026-11-05T10:00:00.000Z' });
    const active = loan({ returnDate: null });
    await syncLoans([returned, active]);

    expect((await prisma.loan.findUniqueOrThrow({ where: { externalId: returned.externalId as string } })).status).toBe('RETURNED');
    expect((await prisma.loan.findUniqueOrThrow({ where: { externalId: active.externalId as string } })).status).toBe('ACTIVE');
  });

  it('availableCopies : valeur absolue, avertissement au-delà de totalCopies, status et loanCount intacts', async () => {
    await syncLoans([loan({ availableCopies: 1 })]);
    expect(await prisma.book.findUniqueOrThrow({ where: { id: bookA.id } })).toMatchObject({ availableCopies: 1, status: 'AVAILABLE', loanCount: 7, totalCopies: 3 });

    const item = loan({ availableCopies: 9 });
    const { body } = await syncLoans([item]);
    expect(body.data.warnings).toHaveLength(1);
    expect(body.data.warnings[0]).toMatchObject({ externalId: item.externalId, bookExternalId: bookA.externalId });
    expect(await prisma.book.findUniqueOrThrow({ where: { id: bookA.id } })).toMatchObject({ availableCopies: 9, status: 'AVAILABLE', loanCount: 7 });

    await syncLoans([loan()]);
    expect((await prisma.book.findUniqueOrThrow({ where: { id: bookA.id } })).availableCopies).toBe(9);
    await prisma.book.update({ where: { id: bookA.id }, data: { availableCopies: 3 } });
  });

  it('renewalRequestedAt : conservé si rien ne change, remis à null si dueDate ou renewalCount change', async () => {
    const item = loan();
    await syncLoans([item]);
    const where = { externalId: item.externalId as string };
    const mark = () => prisma.loan.update({ where, data: { renewalRequestedAt: new Date() } });
    const requested = async () => (await prisma.loan.findUniqueOrThrow({ where })).renewalRequestedAt;

    await mark();
    await syncLoans([item]);
    expect(await requested()).not.toBeNull();

    await syncLoans([{ ...item, renewalCount: 1 }]);
    expect(await requested()).toBeNull();

    await mark();
    await syncLoans([{ ...item, renewalCount: 1, dueDate: new Date(Date.now() + 20 * 86_400_000).toISOString() }]);
    expect(await requested()).toBeNull();
  });

  it('un seul appel journalisé, sans donnée personnelle', async () => {
    const before = new Date();
    await syncLoans([loan()]);
    const logs = await prisma.activityLog.findMany({ where: { action: 'loans.sync', createdAt: { gte: before } } });

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ userId: null, ipAddress: null, userAgent: null });
    expect(JSON.stringify(logs[0].details)).not.toContain(memberWithAccount);
  });
});

describe('inscription d’un membre ayant déjà des prêts', () => {
  it('rattache ses prêts dans la transaction, réponse inchangée', async () => {
    const matricule = `CIRC-M3-${suffix}`;
    await prisma.libraryMember.create({ data: { matricule, nom: 'Nouveau', prenom: 'Membre', dateNaissance: new Date('2001-01-01') } });
    const orphan = loan({ matricule });
    await syncLoans([orphan]);
    const token = createSecureToken();
    await prisma.verificationToken.create({
      data: { identifier: createMemberVerificationIdentifier(matricule), token: hashToken(token), expires: new Date(Date.now() + 600_000) },
    });

    const result = await json(
      await register(
        new NextRequest('http://localhost/api/auth/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.44' },
          body: JSON.stringify({
            matricule,
            verificationToken: token,
            email: `circ-new-${suffix.toLowerCase()}@test.local`,
            username: `circ_new_${suffix}`,
            password: 'Inscription1234',
            confirmPassword: 'Inscription1234',
          }),
        })
      )
    );
    userIds.push(result.body.data.id);

    expect(result.status).toBe(201);
    expect(Object.keys(result.body.data).sort()).toEqual(
      ['createdAt', 'department', 'email', 'firstName', 'id', 'lastName', 'libraryCard', 'photo', 'role', 'status', 'username'].sort()
    );
    expect((await prisma.loan.findUniqueOrThrow({ where: { externalId: orphan.externalId as string } })).userId).toBe(result.body.data.id);
  });
});

describe('comportement du site', () => {
  it('réservation : toujours PENDING malgré des exemplaires disponibles ; livre intact ; un événement', async () => {
    await ackAll();
    const before = await prisma.book.findUniqueOrThrow({ where: { id: bookB.id } });
    as(accountId);

    const { status, body } = await json(await reservationPost(site('POST', { bookId: bookB.id })));

    expect(status).toBe(201);
    expect(body.message).toContain('vous serez prévenu');
    expect(body.data).toMatchObject({ status: 'PENDING', expiryDate: null });
    expect(await prisma.book.findUniqueOrThrow({ where: { id: bookB.id } })).toEqual(before);

    const events = (await readEvents()).body.data.events;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'reservation.created',
      payload: { reservationId: body.data.id, matricule: memberWithAccount, bookExternalId: bookB.externalId },
    });
    expect(Object.keys(events[0].payload).sort()).toEqual(['bookExternalId', 'matricule', 'requestedAt', 'reservationId']);
    expect(JSON.stringify(events)).not.toMatch(/Secretnom|Secretprenom|@test\.local/);

    expect((await reservationPost(site('POST', { bookId: bookB.id }))).status).toBe(409);
    expect((await readEvents()).body.data.events).toHaveLength(1);
  });

  it('échec de l’écriture de l’événement : aucune réservation créée (même transaction)', async () => {
    const book = await prisma.book.create({
      data: { externalId: uid('CIRC-BOOK'), isbn: uid('ISBN'), title: 'T', author: 'A', department: 'D', category: 'C' },
    });
    as(accountId);
    eventFailure.enabled = true;

    expect((await reservationPost(site('POST', { bookId: book.id }))).status).toBe(500);
    expect(await prisma.reservation.count({ where: { bookId: book.id } })).toBe(0);
  });

  it('annulation : CANCELLED + un événement ; refaire → 404 ; échec d’événement → annulée nulle part', async () => {
    await ackAll();
    const id = await freshReservation('READY');
    as(accountId);

    eventFailure.enabled = true;
    expect((await reservationCancel(site('PATCH'), params(id))).status).toBe(500);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id } })).status).toBe('READY');
    eventFailure.enabled = false;

    expect((await reservationCancel(site('PATCH'), params(id))).status).toBe(200);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id } })).status).toBe('CANCELLED');
    expect((await reservationCancel(site('PATCH'), params(id))).status).toBe(404);

    const events = (await readEvents()).body.data.events;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'reservation.cancelled', payload: { reservationId: id, matricule: memberWithAccount } });
  });

  it('renouvellement : demande seulement, dueDate inchangée, 409 en doublon', async () => {
    await ackAll();
    const item = loan({ bookExternalId: bookB.externalId });
    await syncLoans([item]);
    const before = await prisma.loan.findUniqueOrThrow({ where: { externalId: item.externalId as string } });
    as(accountId);

    const { status, body } = await json(await renew(site('PATCH'), params(before.id)));
    expect(status).toBe(200);
    expect(body.message).toContain('Demande de renouvellement envoyée');
    const after = await prisma.loan.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.dueDate).toEqual(before.dueDate);
    expect(after.renewalCount).toBe(before.renewalCount);
    expect(after.renewalRequestedAt).not.toBeNull();

    expect((await renew(site('PATCH'), params(before.id))).status).toBe(409);
    const events = (await readEvents()).body.data.events;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'loan.renewal_requested',
      payload: { loanExternalId: item.externalId, matricule: memberWithAccount, bookExternalId: bookB.externalId, currentDueDate: before.dueDate.toISOString() },
    });
  });

  it('renouvellement : refusé sans externalId, au plafond, ou après l’échéance ; échec d’événement → rien', async () => {
    const base = { userId: accountId, bookId: bookB.id, borrowDate: new Date('2026-10-01') };
    const future = new Date(Date.now() + 86_400_000);
    const noExternal = await prisma.loan.create({ data: { ...base, dueDate: future } });
    const maxed = await prisma.loan.create({ data: { ...base, dueDate: future, externalId: uid('CIRC-LOAN'), renewalCount: 2 } });
    const late = await prisma.loan.create({ data: { ...base, dueDate: new Date(Date.now() - 86_400_000), externalId: uid('CIRC-LOAN') } });
    const rollback = await prisma.loan.create({ data: { ...base, dueDate: future, externalId: uid('CIRC-LOAN') } });
    as(accountId);

    const refused = await json(await renew(site('PATCH'), params(noExternal.id)));
    expect(refused.status).toBe(409);
    expect(refused.body.message).toContain('guichet');
    expect((await renew(site('PATCH'), params(maxed.id))).status).toBe(409);
    expect((await renew(site('PATCH'), params(late.id))).status).toBe(409);

    eventFailure.enabled = true;
    expect((await renew(site('PATCH'), params(rollback.id))).status).toBe(500);
    expect((await prisma.loan.findUniqueOrThrow({ where: { id: rollback.id } })).renewalRequestedAt).toBeNull();
  });

  it('compte ancien sans matricule : événement créé avec matricule null', async () => {
    const legacy = await prisma.user.create({
      data: { email: `circ-old-${suffix.toLowerCase()}@test.local`, username: `circ_old_${suffix}`, password: 'x', firstName: 'A', lastName: 'B', status: 'ACTIVE' },
    });
    userIds.push(legacy.id);
    await ackAll();
    as(legacy.id);

    expect((await reservationPost(site('POST', { bookId: bookA.id }))).status).toBe(201);
    expect((await readEvents()).body.data.events[0].payload.matricule).toBeNull();
  });
});

describe('boîte d’envoi', () => {
  async function emit(count: number): Promise<number[]> {
    await ackAll();
    for (let index = 0; index < count; index += 1) {
      await prisma.$transaction((tx) =>
        recordSiteEvent(tx, 'reservation.created', { reservationId: uid('R'), matricule: null, bookExternalId: 'B', requestedAt: new Date().toISOString() })
      );
    }
    return (await prisma.siteEvent.findMany({ where: { seq: { gt: baselineSeq }, processedAt: null }, orderBy: { seq: 'asc' } })).map((row) => row.seq);
  }

  it('GET : after, limit, ordre croissant, nextAfter', async () => {
    const seqs = await emit(5);
    const page = (await readEvents(`after=${seqs[0]}&limit=2`)).body.data;

    expect(page.events.map((event: { seq: number }) => event.seq)).toEqual([seqs[1], seqs[2]]);
    expect(page.nextAfter).toBe(seqs[2]);
    expect((await readEvents(`after=${seqs[4]}`)).body.data).toEqual({ events: [], nextAfter: seqs[4] });
    for (const query of ['limit=0', 'limit=501', 'after=-1', 'after=abc']) expect((await readEvents(query)).status).toBe(400);
  });

  it('ack upToSeq et seqs : idempotent, un événement acquitté ne revient jamais', async () => {
    const seqs = await emit(4);

    expect((await ack({ upToSeq: seqs[1] })).body.data.acknowledged).toBeGreaterThanOrEqual(2);
    expect((await ack({ upToSeq: seqs[1] })).body.data.acknowledged).toBe(0);
    expect((await ack({ seqs: [seqs[3], seqs[3]] })).body.data.acknowledged).toBe(1);
    expect((await ack({ seqs: [seqs[3]] })).body.data.acknowledged).toBe(0);

    const remaining = (await readEvents()).body.data.events.map((event: { seq: number }) => event.seq);
    expect(remaining).toEqual([seqs[2]]);
    for (const body of [{}, { upToSeq: 0 }, { seqs: [] }, { upToSeq: 1, seqs: [1] }]) expect((await ack(body)).status).toBe(400);
  });

  it('sans ack, l’événement est relivré (au moins une fois)', async () => {
    const seqs = await emit(1);
    expect((await readEvents()).body.data.events.map((event: { seq: number }) => event.seq)).toEqual(seqs);
    expect((await readEvents()).body.data.events.map((event: { seq: number }) => event.seq)).toEqual(seqs);
  });

  it('transaction annulée : aucun événement', async () => {
    await ackAll();
    await expect(
      prisma.$transaction(async (tx) => {
        await recordSiteEvent(tx, 'reservation.created', { reservationId: 'X', matricule: null, bookExternalId: 'B', requestedAt: new Date().toISOString() });
        throw new Error('annulation');
      })
    ).rejects.toThrow('annulation');
    expect((await readEvents()).body.data.events).toHaveLength(0);
  });

  it('concurrence : un seq élevé n’est jamais visible avant un seq inférieur non validé', async () => {
    await ackAll();
    const payload = () => ({ reservationId: uid('R'), matricule: null, bookExternalId: 'B', requestedAt: new Date().toISOString() });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let firstWritten: () => void = () => undefined;
    const written = new Promise<void>((resolve) => { firstWritten = resolve; });
    let secondDone = false;

    const first = prisma.$transaction(async (tx) => {
      await recordSiteEvent(tx, 'reservation.created', payload());
      firstWritten();
      await gate;
    }, { timeout: 15_000 });
    await written;
    const second = prisma.$transaction((tx) => recordSiteEvent(tx, 'reservation.created', payload()), { timeout: 15_000 }).then(() => {
      secondDone = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(secondDone).toBe(false);
    expect((await readEvents()).body.data.events).toHaveLength(0);

    release();
    await Promise.all([first, second]);
    const seqs = (await readEvents()).body.data.events.map((event: { seq: number }) => event.seq);
    expect(seqs).toHaveLength(2);
    expect(seqs[0]).toBeLessThan(seqs[1]);
  }, 30_000);

  it('events:purge : simulation, puis seuls les événements traités et anciens sont supprimés', async () => {
    await ackAll();
    const old = new Date(Date.now() - 40 * 86_400_000);
    const base = { type: 'reservation.created', payload: {} };
    const oldProcessed = await prisma.siteEvent.create({ data: { ...base, createdAt: old, processedAt: old } });
    const oldPending = await prisma.siteEvent.create({ data: { ...base, createdAt: old } });
    const recent = await prisma.siteEvent.create({ data: { ...base, processedAt: new Date() } });

    const dry = runTsScript('scripts/events-purge.ts', ['--days', '30']);
    expect(dry).toContain('Base visée : localhost');
    expect(dry).toContain('Simulation');
    expect(await prisma.siteEvent.count({ where: { seq: oldProcessed.seq } })).toBe(1);

    runTsScript('scripts/events-purge.ts', ['--days', '30', '--yes']);
    expect(await prisma.siteEvent.count({ where: { seq: oldProcessed.seq } })).toBe(0);
    expect(await prisma.siteEvent.count({ where: { seq: { in: [oldPending.seq, recent.seq] } } })).toBe(2);
  }, 60_000);
});

describe('POST /api/reservations/sync', () => {
  it('règles de transition, table complète', () => {
    const allowed: Array<[Parameters<typeof evaluateReservationTransition>[0], Parameters<typeof evaluateReservationTransition>[1]]> = [
      ['PENDING', 'READY'], ['PENDING', 'FULFILLED'], ['PENDING', 'EXPIRED'], ['PENDING', 'CANCELLED'],
      ['READY', 'FULFILLED'], ['READY', 'EXPIRED'], ['READY', 'CANCELLED'],
    ];
    for (const [from, to] of allowed) expect(evaluateReservationTransition(from, to)).toBe('apply');
    for (const from of ['FULFILLED', 'EXPIRED', 'CANCELLED'] as const) {
      expect(evaluateReservationTransition(from, from)).toBe('unchanged');
      for (const to of ['READY', 'FULFILLED', 'EXPIRED', 'CANCELLED'] as const) {
        if (to !== from) expect(evaluateReservationTransition(from, to)).toBe('forbidden');
      }
    }
  });

  it.each([
    ['PENDING', 'READY'], ['PENDING', 'FULFILLED'], ['PENDING', 'EXPIRED'], ['PENDING', 'CANCELLED'],
    ['READY', 'FULFILLED'], ['READY', 'EXPIRED'], ['READY', 'CANCELLED'],
  ] as const)('%s → %s : appliquée', async (from, to) => {
    const reservationId = await freshReservation(from);
    const { body } = await syncReservations([{ reservationId, status: to }]);

    expect(body.data).toMatchObject({ updated: 1, unchanged: 0, rejected: 0 });
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservationId } })).status).toBe(to);
  });

  it.each([
    ['CANCELLED', 'READY'], ['EXPIRED', 'READY'], ['FULFILLED', 'CANCELLED'], ['CANCELLED', 'FULFILLED'], ['EXPIRED', 'FULFILLED'],
  ] as const)('%s → %s : interdite, état stable', async (from, to) => {
    const reservationId = await freshReservation(from);
    const { body } = await syncReservations([{ reservationId, status: to }]);

    expect(body.data).toMatchObject({ updated: 0, rejected: 1 });
    expect(body.data.rejectedDetails[0].reason).toContain('Transition interdite');
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservationId } })).status).toBe(from);
  });

  it('même statut : succès sans effet ; expiryDate appliquée ; réservation inconnue et élément invalide refusés seuls', async () => {
    const done = await freshReservation('FULFILLED');
    const ready = await freshReservation('PENDING');
    const expiry = '2026-12-01T12:00:00.000Z';
    const { status, body } = await syncReservations([
      { reservationId: done, status: 'FULFILLED' },
      { reservationId: ready, status: 'READY', expiryDate: expiry },
      { reservationId: 'inconnue', status: 'READY' },
      { reservationId: ready, status: 'PENDING' },
    ]);

    expect(status).toBe(200);
    expect(body.data).toMatchObject({ updated: 1, unchanged: 1, rejected: 2 });
    expect(body.data.rejectedDetails[0]).toMatchObject({ index: 2, reservationId: 'inconnue', reason: 'Réservation inconnue' });
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: ready } })).expiryDate?.toISOString()).toBe(expiry);
  });
});

describe('non-régression et script de démonstration', () => {
  it('books/sync UPDATE sans availableCopies : ne réécrit pas la disponibilité ; création et valeur explicite inchangées', async () => {
    const externalId = uid('CIRC-BOOK');
    const book = { externalId, title: 'Livre', author: 'Auteur', isbn: `97801${String(counter).padStart(8, '0')}`, department: 'Droit', category: 'Test', totalCopies: 5 };
    const call = async (action: string, data: unknown) => json(await booksSync(webhook('/api/books/sync', { action, book: data })));

    expect((await call('CREATE', book)).body.data.availableCopies).toBe(5);
    await syncLoans([loan({ bookExternalId: externalId, availableCopies: 2 })]);
    expect((await call('UPDATE', { ...book, title: 'Nouveau titre' })).body.data).toMatchObject({ availableCopies: 2, title: 'Nouveau titre' });
    expect((await call('UPDATE', { ...book, availableCopies: 4 })).body.data.availableCopies).toBe(4);
  });

  it('db:seed-demo-loans : exige --yes, idempotent, ne touche ni utilisateurs ni mots de passe', async () => {
    await prisma.loan.deleteMany({ where: { externalId: { startsWith: 'DEMO-' } } });
    const users = () => prisma.$queryRawUnsafe<unknown[]>('SELECT row_to_json(u) FROM "User" u ORDER BY u."id"');
    const before = await users();

    expect(runTsScript('scripts/seed-demo-loans.ts')).toContain('Simulation');
    expect(await prisma.loan.count({ where: { externalId: { startsWith: 'DEMO-' } } })).toBe(0);

    runTsScript('scripts/seed-demo-loans.ts', ['--yes']);
    const first = await prisma.loan.findMany({ where: { externalId: { startsWith: 'DEMO-' } }, orderBy: { externalId: 'asc' } });
    runTsScript('scripts/seed-demo-loans.ts', ['--yes']);
    const second = await prisma.loan.findMany({ where: { externalId: { startsWith: 'DEMO-' } }, orderBy: { externalId: 'asc' } });

    expect(first).toHaveLength(3);
    expect(first.map((row) => row.status).sort()).toEqual(['ACTIVE', 'ACTIVE', 'RETURNED']);
    expect(second).toEqual(first);
    expect(await users()).toEqual(before);
    await prisma.loan.deleteMany({ where: { externalId: { startsWith: 'DEMO-' } } });
  }, 60_000);
});
