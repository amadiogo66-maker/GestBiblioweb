import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from './helpers/local-db';

vi.mock('@/lib/auth', () => ({ auth: vi.fn(), handlers: { GET: vi.fn(), POST: vi.fn() } }));

const { auth, handlers } = await import('@/lib/auth');
const { GET: authGet, POST: authPost } = await import('@/app/api/auth/[...nextauth]/route');
const { GET: me } = await import('@/app/api/auth/me/route');

const suffix = randomUUID().slice(0, 8);
const authMock = vi.mocked(auth as unknown as (...args: unknown[]) => Promise<unknown>);
const getMock = vi.mocked(handlers.GET as unknown as (request: NextRequest) => Promise<Response>);
const postMock = vi.mocked(handlers.POST as unknown as (request: NextRequest) => Promise<Response>);
const ids: Record<string, string> = {};
const DELETED_ID = `compte-supprime-${suffix}`;

/** Chaînes uniques du compte : aucune ne doit sortir pour un compte non actif. */
const markersOf = (status: string, id: string) => [id, `Prenom${status}${suffix}`, `Nom${status}${suffix}`, `sess-${status.toLowerCase()}-${suffix}@test.local`, `sess_${status.toLowerCase()}_${suffix}`];

/** Réponse d'Auth.js pour une session dont le JWT contient encore le compte. */
function authJsSession(status: string, id: string): Response {
  const [, firstName, lastName, email, username] = markersOf(status, id);
  return new Response(JSON.stringify({ user: { id, email, username, firstName, lastName, status: 'ACTIVE' }, expires: '2099-01-01T00:00:00.000Z' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-cache, no-store', 'Set-Cookie': 'authjs.session-token=jwt-renouvele; Path=/; HttpOnly' },
  });
}

const request = (path: string, method = 'GET') => new NextRequest(`http://localhost/api/auth/${path}`, { method });

beforeAll(async () => {
  for (const status of ['ACTIVE', 'SUSPENDED', 'BANNED', 'PENDING'] as const) {
    const lower = status.toLowerCase();
    const user = await prisma.user.create({
      data: { email: `sess-${lower}-${suffix}@test.local`, username: `sess_${lower}_${suffix}`, password: 'x', firstName: `Prenom${status}${suffix}`, lastName: `Nom${status}${suffix}`, status },
    });
    ids[status] = user.id;
  }
  ids.SUPPRIME = DELETED_ID;
});

beforeEach(() => {
  authMock.mockReset();
  getMock.mockReset();
  postMock.mockReset();
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
});

describe('/api/auth/session', () => {
  it.each(['SUSPENDED', 'BANNED', 'PENDING', 'SUPPRIME'])('compte %s : réponse anonyme, aucune donnée, aucun cookie renouvelé', async (status) => {
    getMock.mockResolvedValue(authJsSession(status, ids[status]));

    const response = await authGet(request('session'));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toBe('null');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(response.headers.get('set-cookie')).toBeNull();
    for (const marker of markersOf(status, ids[status])) expect(body).not.toContain(marker);
  });

  it('compte actif : réponse d’Auth.js inchangée, une seule lecture (id et status)', async () => {
    const original = authJsSession('ACTIVE', ids.ACTIVE);
    getMock.mockResolvedValue(original);
    const spy = vi.spyOn(prisma.user, 'findUnique');

    const response = await authGet(request('session'));

    expect(response).toBe(original);
    expect(await response.json()).toMatchObject({ user: { id: ids.ACTIVE, firstName: `PrenomACTIVE${suffix}` } });
    expect(response.headers.get('set-cookie')).toContain('authjs.session-token=');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ where: { id: ids.ACTIVE }, select: { id: true, status: true } });
    spy.mockRestore();
  });

  it('sans session : réponse d’Auth.js transmise, aucune lecture', async () => {
    const original = new Response('null', { status: 200, headers: { 'Content-Type': 'application/json' } });
    getMock.mockResolvedValue(original);
    const spy = vi.spyOn(prisma.user, 'findUnique');

    expect(await authGet(request('session'))).toBe(original);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('autres points GET (csrf, providers) : transmis sans lecture', async () => {
    const spy = vi.spyOn(prisma.user, 'findUnique');

    for (const path of ['csrf', 'providers']) {
      const original = authJsSession('SUSPENDED', ids.SUSPENDED);
      getMock.mockResolvedValue(original);
      expect(await authGet(request(path))).toBe(original);
    }
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('POST inchangé : déconnexion déléguée à Auth.js, preuve MFA effacée', async () => {
    postMock.mockResolvedValue(new Response(null, { status: 302, headers: { location: 'http://localhost/' } }));

    const response = await authPost(request('signout', 'POST'));

    expect(postMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(302);
    expect(response.headers.get('set-cookie')).toContain('staff_mfa=');
  });
});

describe('/api/auth/me', () => {
  it.each(['SUSPENDED', 'BANNED', 'PENDING', 'SUPPRIME'])('compte %s : 401 sans aucune donnée', async (status) => {
    authMock.mockResolvedValue({ user: { id: ids[status], status: 'ACTIVE' }, expires: '2099-01-01' });

    const response = await me();
    const body = await response.text();

    expect(response.status).toBe(401);
    expect(JSON.parse(body)).toEqual({ success: false, message: 'Non authentifié' });
    for (const marker of markersOf(status, ids[status])) expect(body).not.toContain(marker);
  });

  it('sans session : 401', async () => {
    authMock.mockResolvedValue(null);

    expect((await me()).status).toBe(401);
  });

  it('compte actif : profil public renvoyé, sans password ni qrCode', async () => {
    authMock.mockResolvedValue({ user: { id: ids.ACTIVE, status: 'ACTIVE' }, expires: '2099-01-01' });

    const response = await me();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ id: ids.ACTIVE, firstName: `PrenomACTIVE${suffix}`, status: 'ACTIVE' });
    expect(body.data).not.toHaveProperty('password');
    expect(body.data).not.toHaveProperty('qrCode');
  });
});
