import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { prisma } from './helpers/local-db';
import { runTsScript } from './helpers/run-script';
import { restoreCirculationContact, snapshotCirculationContact } from './helpers/circulation-contact';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

const { auth } = await import('@/lib/auth');
const { createNotification } = await import('@/lib/notifications');
const { generateLoanReminders } = await import('@/lib/notification-reminders');
const { attachOrphanLoans } = await import('@/lib/circulation');
const { getDashboardOverview } = await import('@/lib/dashboard-data');
const { CIRCULATION_CONTACT_KEY, isCirculationReachable, recordCirculationContact } = await import('@/lib/circulation-status');
const { listNotificationsSchema } = await import('@/schemas/notification');
const { POST: loansSync } = await import('@/app/api/loans/sync/route');
const { POST: reservationsSync } = await import('@/app/api/reservations/sync/route');
const { POST: notificationsSync } = await import('@/app/api/notifications/sync/route');
const { POST: booksSync } = await import('@/app/api/books/sync/route');
const { POST: membersSync } = await import('@/app/api/members/sync/route');
const { POST: newsSync } = await import('@/app/api/news/sync/route');
const { GET: eventsGet } = await import('@/app/api/events/route');
const { POST: reservationPost } = await import('@/app/api/reservations/route');
const { PATCH: renew } = await import('@/app/api/loans/[id]/renew/route');
const { default: EmpruntsPage } = await import('@/app/(dashboard)/emprunts/page');
const { default: ReservationsPage } = await import('@/app/(dashboard)/reservations/page');

const suffix = randomUUID().slice(0, 8).toUpperCase();
const PREFIX = `TEST-NOTIF-${suffix}`;
const apiKey = `test-notifications-${suffix}`;
const originalKey = process.env.GEST_BIBLIO_API_KEY;
const startedAt = new Date();
const authMock = vi.mocked(auth as unknown as (...args: unknown[]) => Promise<unknown>);
const BANNER = 'momentanément suspendu';
const MINUTE = 60_000;
const DAY = 86_400_000;
let baselineSeq = 0;
let counter = 0;
let accountId = '';
let otherAccountId = '';
let bookId = '';
let contactSnapshot: Awaited<ReturnType<typeof snapshotCirculationContact>> = null;
const member = `${PREFIX}-M1`;
const otherMember = `${PREFIX}-M2`;
const memberNoAccount = `${PREFIX}-M3`;
const bookExternalId = `${PREFIX}-BOOK`;
const BOOK_TITLE = 'Livre de test notifications';

const uid = (label: string): string => {
  counter += 1;
  return `${PREFIX}-${label}-${counter}`;
};

function webhook(url: string, body: unknown, key: string | null = apiKey): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { 'x-api-key': key } : {}) },
    body: JSON.stringify(body),
  });
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
const syncNotifications = async (body: unknown) => json(await notificationsSync(webhook('/api/notifications/sync', body)));
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const as = (id: string) => authMock.mockResolvedValue({ user: { id, status: 'ACTIVE', firstName: 'Test' }, expires: '2099-01-01' });
const byKey = (dedupeKey: string) => prisma.notification.findMany({ where: { dedupeKey } });

function loan(overrides: Record<string, unknown> = {}) {
  return {
    externalId: uid('LOAN'),
    matricule: member,
    bookExternalId,
    borrowDate: new Date(Date.now() - 2 * DAY).toISOString(),
    dueDate: new Date(Date.now() + 10 * DAY).toISOString(),
    ...overrides,
  };
}

/** Prêt synchronisé, avec une demande de renouvellement réellement passée par la route. */
async function requestedLoan(overrides: Record<string, unknown> = {}) {
  const item = loan(overrides);
  await syncLoans([item]);
  const row = await prisma.loan.findUniqueOrThrow({ where: { externalId: item.externalId as string } });
  as(accountId);
  expect((await renew(site('PATCH'), params(row.id))).status).toBe(200);
  return { item, id: row.id };
}

/** Un livre par réservation : l'index partiel interdit deux réservations actives identiques. */
async function reservation(status: 'PENDING' | 'READY'): Promise<string> {
  const book = await prisma.book.create({
    data: { externalId: uid('BOOK'), isbn: uid('I').slice(-20), title: BOOK_TITLE, author: 'A', department: 'D', category: 'C' },
  });
  const row = await prisma.reservation.create({ data: { userId: accountId, bookId: book.id, status } });
  return row.id;
}

beforeAll(async () => {
  process.env.GEST_BIBLIO_API_KEY = apiKey;
  contactSnapshot = await snapshotCirculationContact();
  baselineSeq = (await prisma.siteEvent.aggregate({ _max: { seq: true } }))._max.seq ?? 0;
  bookId = (
    await prisma.book.create({
      data: { externalId: bookExternalId, isbn: `TN-${suffix}`, title: BOOK_TITLE, author: 'Test', department: 'Droit', category: 'Test', totalCopies: 4, availableCopies: 4, loanCount: 3 },
    })
  ).id;
  await prisma.libraryMember.createMany({
    data: [member, otherMember, memberNoAccount].map((matricule) => ({ matricule, nom: 'Test', prenom: 'Notif', dateNaissance: new Date('2000-01-01') })),
  });
  const makeUser = (key: string, matricule: string) =>
    prisma.user.create({
      data: { email: `test-notif-${key}-${suffix.toLowerCase()}@test.local`, username: `test_notif_${key}_${suffix}`, password: 'x', firstName: 'Test', lastName: 'Notif', status: 'ACTIVE', matricule },
    });
  accountId = (await makeUser('a', member)).id;
  otherAccountId = (await makeUser('b', otherMember)).id;
});

beforeEach(() => {
  authMock.mockReset();
});

afterAll(async () => {
  if (originalKey === undefined) delete process.env.GEST_BIBLIO_API_KEY;
  else process.env.GEST_BIBLIO_API_KEY = originalKey;
  const userIds = [accountId, otherAccountId];
  await prisma.siteEvent.deleteMany({ where: { seq: { gt: baselineSeq } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.loan.deleteMany({ where: { externalId: { startsWith: PREFIX } } });
  await prisma.reservation.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.activityLog.deleteMany({
    where: {
      OR: [
        { userId: { in: userIds } },
        { action: { in: ['loans.sync', 'reservations.sync', 'events.read', 'events.ack', 'book.sync.create', 'book.sync.update'] }, createdAt: { gte: startedAt } },
      ],
    },
  });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.libraryMember.deleteMany({ where: { matricule: { startsWith: PREFIX } } });
  await prisma.book.deleteMany({ where: { externalId: { startsWith: PREFIX } } });
  await restoreCirculationContact(contactSnapshot);
});

describe('notifications événementielles', () => {
  it('READY : BOOK_AVAILABLE avec titre et date, une seule fois même rejoué', async () => {
    const id = await reservation('PENDING');
    const expiryDate = '2026-12-05T12:00:00.000Z';

    await syncReservations([{ reservationId: id, status: 'READY', expiryDate }]);
    await syncReservations([{ reservationId: id, status: 'READY', expiryDate }]);
    const rows = await byKey(`reservation:${id}:ready`);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: accountId, type: 'BOOK_AVAILABLE', source: 'site', isRead: false });
    expect(rows[0].message).toBe(`Votre réservation de "${BOOK_TITLE}" est prête, elle est conservée jusqu'au 05/12/2026.`);
  });

  it('EXPIRED : GENERAL, une seule fois ; CANCELLED : aucune notification', async () => {
    const expired = await reservation('READY');
    await syncReservations([{ reservationId: expired, status: 'EXPIRED' }]);
    await syncReservations([{ reservationId: expired, status: 'EXPIRED' }]);
    expect(await byKey(`reservation:${expired}:expired`)).toHaveLength(1);
    expect((await byKey(`reservation:${expired}:expired`))[0].type).toBe('GENERAL');

    const cancelled = await reservation('PENDING');
    const before = await prisma.notification.count({ where: { userId: accountId } });
    await syncReservations([{ reservationId: cancelled, status: 'CANCELLED' }]);
    expect(await prisma.notification.count({ where: { userId: accountId } })).toBe(before);
  });

  it('renouvellement accepté : notification unique, demande levée', async () => {
    const { item, id } = await requestedLoan();
    const dueDate = new Date(new Date(item.dueDate as string).getTime() + 7 * DAY).toISOString();
    const granted = { ...item, dueDate, renewalCount: 1 };

    await syncLoans([granted]);
    await syncLoans([granted]);

    const rows = await byKey(`loan:${item.externalId}:renewal-granted:${dueDate}`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'GENERAL', userId: accountId });
    expect((await prisma.loan.findUniqueOrThrow({ where: { id } })).renewalRequestedAt).toBeNull();
  });

  it('sans demande en attente, une nouvelle échéance ne notifie pas', async () => {
    const item = loan();
    await syncLoans([item]);
    const dueDate = new Date(Date.now() + 20 * DAY).toISOString();
    await syncLoans([{ ...item, dueDate }]);

    expect(await byKey(`loan:${item.externalId}:renewal-granted:${dueDate}`)).toHaveLength(0);
  });

  it('prêt sans compte web : aucune notification', async () => {
    const item = loan({ matricule: memberNoAccount });
    await syncLoans([item]);
    await prisma.loan.update({ where: { externalId: item.externalId as string }, data: { renewalRequestedAt: new Date() } });
    const dueDate = new Date(Date.now() + 25 * DAY).toISOString();
    await syncLoans([{ ...item, dueDate, renewalCount: 1 }]);

    expect(await byKey(`loan:${item.externalId}:renewal-granted:${dueDate}`)).toHaveLength(0);
    await prisma.loan.delete({ where: { externalId: item.externalId as string } });
  });

  it('createNotification : idempotent par dedupeKey', async () => {
    const dedupeKey = uid('KEY');
    const input = { userId: accountId, type: 'GENERAL' as const, title: 'T', message: 'M', dedupeKey, source: 'site' as const };

    expect(await createNotification(prisma, input)).toBe(true);
    expect(await createNotification(prisma, input)).toBe(false);
    expect(await byKey(dedupeKey)).toHaveLength(1);
  });
});

describe('refus de renouvellement', () => {
  it('demande levée, notification unique, 409 sur nouvelle demande, retour à la normale quand dueDate change', async () => {
    const { item, id } = await requestedLoan();
    const refused = { ...item, renewalDecision: 'REFUSED' };

    expect((await syncLoans([refused])).body.data.rejected).toBe(0);
    let row = await prisma.loan.findUniqueOrThrow({ where: { id } });
    expect(row.renewalRequestedAt).toBeNull();
    expect(row.renewalRefusedAt).not.toBeNull();
    const firstRefusal = row.renewalRefusedAt;

    await syncLoans([refused]);
    row = await prisma.loan.findUniqueOrThrow({ where: { id } });
    expect(row.renewalRefusedAt).toEqual(firstRefusal);
    expect(await byKey(`loan:${item.externalId}:renewal-refused:${new Date(item.dueDate as string).toISOString()}`)).toHaveLength(1);

    as(accountId);
    const blocked = await json(await renew(site('PATCH'), params(id)));
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toContain('refusé');

    await syncLoans([{ ...item, dueDate: new Date(Date.now() + 18 * DAY).toISOString() }]);
    expect((await prisma.loan.findUniqueOrThrow({ where: { id } })).renewalRefusedAt).toBeNull();
    expect((await renew(site('PATCH'), params(id))).status).toBe(200);
  });

  it('second refus après un changement d’échéance : nouvelle notification ; même refus rejoué : aucun doublon', async () => {
    const { item, id } = await requestedLoan();
    const refusalKeys = async () =>
      (await prisma.notification.findMany({ where: { dedupeKey: { startsWith: `loan:${item.externalId}:renewal-refused:` } } })).map((row) => row.dedupeKey);

    await syncLoans([{ ...item, renewalDecision: 'REFUSED' }]);
    await syncLoans([{ ...item, renewalDecision: 'REFUSED' }]);
    expect(await refusalKeys()).toHaveLength(1);

    const newDue = new Date(new Date(item.dueDate as string).getTime() + 5 * DAY).toISOString();
    const moved = { ...item, dueDate: newDue };
    await syncLoans([moved]);
    as(accountId);
    expect((await renew(site('PATCH'), params(id))).status).toBe(200);
    await syncLoans([{ ...moved, renewalDecision: 'REFUSED' }]);
    await syncLoans([{ ...moved, renewalDecision: 'REFUSED' }]);

    const keys = await refusalKeys();
    expect(keys).toHaveLength(2);
    expect(keys).toContain(`loan:${item.externalId}:renewal-refused:${newDue}`);
  });

  it('refus levé quand le prêt n’est plus ACTIVE ; refus avec échéance modifiée rejeté seul', async () => {
    const { item, id } = await requestedLoan();
    const incoherent = await syncLoans([{ ...item, dueDate: new Date(Date.now() + 30 * DAY).toISOString(), renewalDecision: 'REFUSED' }]);
    expect(incoherent.body.data.rejected).toBe(1);
    expect(incoherent.body.data.rejectedDetails[0].reason).toContain('renewalDecision');
    expect((await prisma.loan.findUniqueOrThrow({ where: { id } })).renewalRequestedAt).not.toBeNull();

    await syncLoans([{ ...item, renewalDecision: 'REFUSED' }]);
    await syncLoans([{ ...item, status: 'RETURNED', returnDate: new Date().toISOString() }]);
    expect((await prisma.loan.findUniqueOrThrow({ where: { id } })).renewalRefusedAt).toBeNull();
  });
});

describe('rappels planifiés', () => {
  it('retard et échéance proche : un seul rappel, rejeu sans doublon, Loan.status intact', async () => {
    const now = new Date();
    const onlyUserIds = [otherAccountId];
    const overdue = loan({ matricule: otherMember, borrowDate: new Date(now.getTime() - 20 * DAY).toISOString(), dueDate: new Date(now.getTime() - DAY).toISOString() });
    const soon = loan({ matricule: otherMember, dueDate: new Date(now.getTime() + 2 * DAY).toISOString() });
    const far = loan({ matricule: otherMember, dueDate: new Date(now.getTime() + 9 * DAY).toISOString() });
    await syncLoans([overdue, soon, far]);

    const dry = await generateLoanReminders(prisma, { apply: false, now, onlyUserIds });
    expect(dry).toMatchObject({ overdue: 1, dueSoon: 1, created: 0 });
    expect(await prisma.notification.count({ where: { userId: otherAccountId } })).toBe(0);

    expect(await generateLoanReminders(prisma, { apply: true, now, onlyUserIds })).toMatchObject({ created: 2, alreadySent: 0 });
    expect(await generateLoanReminders(prisma, { apply: true, now, onlyUserIds })).toMatchObject({ created: 0, alreadySent: 2 });

    const rows = await prisma.notification.findMany({ where: { userId: otherAccountId } });
    expect(rows.map((row) => row.type).sort()).toEqual(['GENERAL', 'OVERDUE']);
    expect((await prisma.loan.findUniqueOrThrow({ where: { externalId: overdue.externalId as string } })).status).toBe('ACTIVE');
  });

  it('notifications:generate sans --yes : base affichée, aucune écriture', async () => {
    const before = await prisma.notification.count();
    const output = runTsScript('scripts/notifications-generate.ts');

    expect(output).toContain('Base visée : localhost');
    expect(output).toContain('Simulation');
    expect(await prisma.notification.count()).toBe(before);
  }, 30_000);
});

describe('POST /api/notifications/sync', () => {
  const content = { type: 'ANNOUNCEMENT', title: 'Annonce', message: 'Message du logiciel' };

  it('forme historique par userId : inchangée, source software', async () => {
    const { status, body } = await syncNotifications({ userId: accountId, ...content });

    expect(status).toBe(200);
    expect(body.message).toBe('Notification synchronisée');
    expect(body.data).toMatchObject({ userId: accountId, title: 'Annonce', isRead: false });
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: body.data.id } })).source).toBe('software');
  });

  it('par matricule, dedupeKey préfixé sw:, rejeu sans doublon', async () => {
    const dedupeKey = uid('SW');
    const first = await syncNotifications({ matricule: member, dedupeKey, ...content });
    const second = await syncNotifications({ matricule: member, dedupeKey, ...content });

    expect(first.body.data).toMatchObject({ userId: accountId, deduplicated: false });
    expect(second.body.data).toMatchObject({ id: first.body.data.id, deduplicated: true });
    expect(await byKey(`sw:${dedupeKey}`)).toHaveLength(1);
    expect(await byKey(dedupeKey)).toHaveLength(0);
  });

  it('lot tolérant : membre sans compte et inconnu rejetés seuls', async () => {
    const key = uid('BATCH');
    const { status, body } = await syncNotifications({
      notifications: [
        { matricule: member, dedupeKey: key, ...content },
        { matricule: memberNoAccount, ...content },
        { matricule: 'INCONNU', ...content },
        { userId: 'inconnu', ...content },
        { matricule: member, dedupeKey: key, ...content },
        { ...content },
      ],
    });

    expect(status).toBe(200);
    expect(body.data).toMatchObject({ created: 1, duplicates: 1, rejected: 4 });
    expect(body.data.rejectedDetails[0]).toEqual({ index: 1, reason: 'Membre sans compte web' });
    expect(body.data.rejectedDetails[1].reason).toBe('Membre inconnu');
    expect(body.data.rejectedDetails[2].reason).toBe('Utilisateur introuvable');
  });

  it('un seul : membre sans compte 404 ; userId et matricule ensemble 400 ; clé d’un autre compte 409', async () => {
    const single = await syncNotifications({ matricule: memberNoAccount, ...content });
    expect(single).toEqual({ status: 404, body: { success: false, message: 'Membre sans compte web' } });
    expect((await syncNotifications({ userId: accountId, matricule: member, ...content })).status).toBe(400);

    const key = uid('CONFLICT');
    await syncNotifications({ matricule: member, dedupeKey: key, ...content });
    expect((await syncNotifications({ matricule: otherMember, dedupeKey: key, ...content })).status).toBe(409);
  });

  it('isRead "false" vaut false, "true" vaut true', async () => {
    expect(listNotificationsSchema.parse({ isRead: 'false' }).isRead).toBe(false);
    expect(listNotificationsSchema.parse({ isRead: 'true' }).isRead).toBe(true);
    expect(listNotificationsSchema.safeParse({ isRead: 'oui' }).success).toBe(false);
    expect((await syncNotifications({ userId: accountId, isRead: 'false', ...content })).body.data.isRead).toBe(false);
    expect((await syncNotifications({ userId: accountId, isRead: 'true', dedupeKey: uid('READ'), ...content })).body.data.isRead).toBe(true);
  });
});

describe('dernier contact du logiciel', () => {
  const clear = () => prisma.siteSetting.deleteMany({ where: { key: CIRCULATION_CONTACT_KEY } });

  it('au plus une écriture par minute', async () => {
    await clear();
    const start = new Date(Date.now() - 10 * MINUTE);

    expect(await recordCirculationContact(start)).toBe(true);
    expect(await recordCirculationContact(new Date(start.getTime() + 30_000))).toBe(false);
    expect(await recordCirculationContact(new Date(start.getTime() + 59_000))).toBe(false);
    expect(await recordCirculationContact(new Date(start.getTime() + MINUTE))).toBe(true);
  });

  it('joignable sous 15 minutes, injoignable au-delà ou sans contact', async () => {
    await clear();
    const contact = new Date();
    expect(await isCirculationReachable(contact)).toBe(false);

    await recordCirculationContact(contact);
    expect(await isCirculationReachable(new Date(contact.getTime() + 14 * MINUTE))).toBe(true);
    expect(await isCirculationReachable(new Date(contact.getTime() + 15 * MINUTE))).toBe(false);
  });

  it('bandeau sur Emprunts et Réservations selon le délai ; boutons non concernés', async () => {
    await clear();
    as(accountId);
    const render = async () => [
      renderToStaticMarkup((await EmpruntsPage({ searchParams: Promise.resolve({}) })) as ReactElement),
      renderToStaticMarkup((await ReservationsPage()) as ReactElement),
    ];

    for (const html of await render()) expect(html).toContain(BANNER);

    await recordCirculationContact();
    for (const html of await render()) expect(html).not.toContain(BANNER);
  });

  it('GET /api/events et loans/sync notent le contact ; sans clé, rien', async () => {
    await clear();
    expect((await eventsGet(new NextRequest('http://localhost/api/events'))).status).toBe(401);
    expect(await prisma.siteSetting.count({ where: { key: CIRCULATION_CONTACT_KEY } })).toBe(0);

    await eventsGet(new NextRequest('http://localhost/api/events', { headers: { 'x-api-key': apiKey } }));
    expect(await prisma.siteSetting.count({ where: { key: CIRCULATION_CONTACT_KEY } })).toBe(1);

    await clear();
    await syncLoans([loan()]);
    expect(await prisma.siteSetting.count({ where: { key: CIRCULATION_CONTACT_KEY } })).toBe(1);
  });

  it('une lecture vide n’est pas journalisée, une lecture avec événements l’est', async () => {
    await prisma.siteEvent.updateMany({ where: { seq: { gt: baselineSeq }, processedAt: null }, data: { processedAt: new Date() } });
    const count = () => prisma.activityLog.count({ where: { action: 'events.read', createdAt: { gte: startedAt } } });
    const before = await count();

    await eventsGet(new NextRequest(`http://localhost/api/events?after=${baselineSeq}`, { headers: { 'x-api-key': apiKey } }));
    expect(await count()).toBe(before);

    await prisma.siteEvent.create({ data: { type: 'reservation.created', payload: {} } });
    await eventsGet(new NextRequest(`http://localhost/api/events?after=${baselineSeq}`, { headers: { 'x-api-key': apiKey } }));
    expect(await count()).toBe(before + 1);
    await prisma.siteEvent.updateMany({ where: { seq: { gt: baselineSeq }, processedAt: null }, data: { processedAt: new Date() } });
  });
});

describe('books/sync', () => {
  it('mise à jour : champs absents conservés ; création : valeurs par défaut', async () => {
    const externalId = uid('BOOK');
    const required = { externalId, title: 'Titre', author: 'Auteur', isbn: `97802${String(counter).padStart(8, '0')}`, department: 'Droit', category: 'Test' };
    const call = async (action: string, book: unknown) => json(await booksSync(webhook('/api/books/sync', { action, book })));

    const created = await call('CREATE', required);
    expect(created.body.data).toMatchObject({ totalCopies: 1, availableCopies: 1, status: 'AVAILABLE', loanCount: 0, isNew: false });

    await call('UPDATE', { ...required, publisher: 'Éditeur', location: 'A-1', totalCopies: 6, availableCopies: 2, status: 'UNDER_MAINTENANCE', loanCount: 12, isNew: true, year: 2020 });

    for (const action of ['UPDATE', 'CREATE']) {
      const result = await call(action, { ...required, title: `Nouveau ${action}` });
      expect(result.status).toBe(200);
      expect(result.body.data).toMatchObject({
        title: `Nouveau ${action}`,
        publisher: 'Éditeur',
        location: 'A-1',
        totalCopies: 6,
        availableCopies: 2,
        status: 'UNDER_MAINTENANCE',
        loanCount: 12,
        isNew: true,
        year: 2020,
      });
    }

    expect((await call('UPDATE', { ...required, availableCopies: 5 })).body.data.availableCopies).toBe(5);
    expect((await call('UPDATE', { ...required, totalCopies: 2, availableCopies: 3 })).status).toBe(400);
  });
});

describe('réservations simultanées', () => {
  it('une seule ligne, un seul événement, les autres en 409 et jamais en 500', async () => {
    const book = await prisma.book.create({
      data: { externalId: uid('BOOK'), isbn: `TD-${suffix}`, title: 'Doublon', author: 'A', department: 'D', category: 'C' },
    });
    const seqBefore = (await prisma.siteEvent.aggregate({ _max: { seq: true } }))._max.seq ?? 0;
    as(accountId);

    const responses = await Promise.all(Array.from({ length: 8 }, () => reservationPost(site('POST', { bookId: book.id }))));
    const statuses = responses.map((response) => response.status).sort();

    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(7);
    expect(await prisma.reservation.count({ where: { bookId: book.id } })).toBe(1);
    const events = await prisma.siteEvent.findMany({ where: { seq: { gt: seqBefore }, type: 'reservation.created' } });
    expect(events).toHaveLength(1);
    for (const response of responses.filter((item) => item.status === 409)) {
      expect((await response.json()).message).toBe('Vous avez déjà une réservation active pour ce livre');
    }
    await prisma.siteEvent.updateMany({ where: { seq: { gt: seqBefore } }, data: { processedAt: new Date() } });
    await prisma.reservation.deleteMany({ where: { bookId: book.id } });
  }, 30_000);
});

describe('rattachement tardif', () => {
  it('un prêt orphelin rejoint le compte à la lecture du tableau de bord ou des emprunts', async () => {
    const item = loan({ matricule: otherMember });
    await syncLoans([item]);
    const where = { externalId: item.externalId as string };
    await prisma.loan.update({ where, data: { userId: null } });

    await getDashboardOverview(otherAccountId);
    expect((await prisma.loan.findUniqueOrThrow({ where })).userId).toBe(otherAccountId);

    await prisma.loan.update({ where, data: { userId: null } });
    as(otherAccountId);
    await EmpruntsPage({ searchParams: Promise.resolve({}) });
    expect((await prisma.loan.findUniqueOrThrow({ where })).userId).toBe(otherAccountId);
  });

  it('n’attache pas un prêt d’un autre matricule, ni un prêt déjà rattaché', async () => {
    const orphan = loan({ matricule: memberNoAccount });
    const owned = loan({ matricule: member });
    await syncLoans([orphan, owned]);

    await attachOrphanLoans(otherAccountId);

    expect((await prisma.loan.findUniqueOrThrow({ where: { externalId: orphan.externalId as string } })).userId).toBeNull();
    expect((await prisma.loan.findUniqueOrThrow({ where: { externalId: owned.externalId as string } })).userId).toBe(accountId);
    await prisma.loan.delete({ where: { externalId: orphan.externalId as string } });
  });
});

describe('clé API des 4 webhooks historiques', () => {
  const routes: Array<[string, (request: NextRequest) => Promise<Response>]> = [
    ['/api/books/sync', booksSync],
    ['/api/members/sync', membersSync],
    ['/api/news/sync', newsSync],
    ['/api/notifications/sync', notificationsSync],
  ];

  it.each(routes)('%s : 401 sans clé ou clé fausse, 500 si non configurée', async (url, handler) => {
    const expected401 = { status: 401, body: { success: false, message: 'Clé API invalide' } };

    expect(await json(await handler(webhook(url, {}, null)))).toEqual(expected401);
    expect(await json(await handler(webhook(url, {}, 'mauvaise-cle')))).toEqual(expected401);

    delete process.env.GEST_BIBLIO_API_KEY;
    const unconfigured = await json(await handler(webhook(url, {}, apiKey)));
    process.env.GEST_BIBLIO_API_KEY = apiKey;
    expect(unconfigured).toEqual({ status: 500, body: { success: false, message: 'Synchronisation indisponible' } });
  });
});

describe('simulateur du logiciel', () => {
  const statePath = join(tmpdir(), `simulator-${suffix}.json`);

  it('refuse une URL non locale sans --allow-remote', () => {
    let error: (Error & { stderr?: string }) | null = null;
    try {
      runTsScript('scripts/simulate-library-software.ts', ['--base-url', 'https://exemple.invalid', '--once', '--yes', '--state', statePath]);
    } catch (caught) {
      error = caught as Error & { stderr?: string };
    }

    expect(error?.stderr).toContain('URL non locale refusée');
    expect(existsSync(statePath)).toBe(false);
  }, 30_000);

  it('exige --base-url', () => {
    expect(() => runTsScript('scripts/simulate-library-software.ts', ['--once'])).toThrow();
  }, 30_000);

  it('sans --yes : URL affichée, aucune requête, aucun état écrit', async () => {
    const before = await prisma.siteEvent.count({ where: { processedAt: null } });
    // Port fermé : une requête éventuelle ferait échouer le script.
    const output = runTsScript('scripts/simulate-library-software.ts', ['--base-url', 'http://localhost:9', '--once', '--state', statePath]);

    expect(output).toContain('URL visée : http://localhost:9');
    expect(output).toContain('aucune requête envoyée');
    expect(existsSync(statePath)).toBe(false);
    expect(await prisma.siteEvent.count({ where: { processedAt: null } })).toBe(before);
  }, 30_000);
});
