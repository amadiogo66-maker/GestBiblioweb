import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from './helpers/local-db';
import { BODY_LIMITS, PAYLOAD_TOO_LARGE_MESSAGE } from '@/lib/constants';
import { PayloadTooLargeError, payloadTooLargeResponse, readBodyText, readJsonBody, readJsonBodyOrNull } from '@/lib/json-body';

vi.mock('@/lib/auth', () => ({ auth: vi.fn(), handlers: { GET: vi.fn(), POST: vi.fn(async () => new Response(null, { status: 302 })) } }));

const { POST: contact } = await import('@/app/api/contact/route');
const { POST: eventsAck } = await import('@/app/api/events/ack/route');
const { POST: authPost } = await import('@/app/api/auth/[...nextauth]/route');
const { handlers } = await import('@/lib/auth');

const KEY = randomBytes(24).toString('hex');
const savedKey = process.env.GEST_BIBLIO_API_KEY;
const startedAt = new Date();

/** JSON de exactement `size` octets : {"p":"xxx…"}. */
function jsonOfSize(size: number): string {
  return `{"p":"${'x'.repeat(size - 8)}"}`;
}

/** Corps en flux, par morceaux, sans Content-Length. */
function streamed(text: string, chunk = 16 * 1024): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) return controller.close();
      controller.enqueue(bytes.subarray(offset, offset + chunk));
      offset += chunk;
    },
  });
}

const post = (url: string, body: BodyInit | null, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost', host: 'localhost', 'x-forwarded-for': `198.51.100.${Math.floor(Math.random() * 250) + 1}`, ...headers },
    body,
    ...(body instanceof ReadableStream ? { duplex: 'half' } : {}),
  } as ConstructorParameters<typeof NextRequest>[1]);

beforeAll(() => {
  process.env.GEST_BIBLIO_API_KEY = KEY;
});

afterAll(async () => {
  if (savedKey === undefined) delete process.env.GEST_BIBLIO_API_KEY;
  else process.env.GEST_BIBLIO_API_KEY = savedKey;
  await prisma.rateLimitBucket.deleteMany({ where: { key: { startsWith: 'contact:ip:' }, windowStart: { gte: new Date(startedAt.getTime() - 60 * 60 * 1000) } } });
  await prisma.activityLog.deleteMany({ where: { action: { in: ['events.ack', 'events.ack.error'] }, createdAt: { gte: startedAt } } });
});

describe('readBodyText / readJsonBody', () => {
  const limit = 1024;

  it('corps exactement à la limite : accepté', async () => {
    const text = jsonOfSize(limit);
    expect(Buffer.byteLength(text)).toBe(limit);

    await expect(readJsonBody(post('/x', text), limit)).resolves.toEqual({ p: 'x'.repeat(limit - 8) });
  });

  it('un octet de trop : PayloadTooLargeError', async () => {
    await expect(readJsonBody(post('/x', jsonOfSize(limit + 1)), limit)).rejects.toBeInstanceOf(PayloadTooLargeError);
  });

  it('octets comptés, pas caractères : 1 caractère accentué = 2 octets', async () => {
    const text = `{"p":"${'é'.repeat(510)}"}`; // 8 + 1020 = 1028 octets pour 518 caractères
    expect(text.length).toBeLessThan(limit);

    await expect(readJsonBody(post('/x', text), limit)).rejects.toBeInstanceOf(PayloadTooLargeError);
  });

  it('sans Content-Length (flux par morceaux) : plafond appliqué quand même', async () => {
    const small = post('/x', streamed(jsonOfSize(limit), 100));
    const big = post('/x', streamed(jsonOfSize(10 * limit), 100));
    expect(small.headers.get('content-length')).toBeNull();

    await expect(readJsonBody(small, limit)).resolves.toMatchObject({ p: expect.any(String) });
    await expect(readJsonBody(big, limit)).rejects.toBeInstanceOf(PayloadTooLargeError);
  });

  it('Content-Length mensonger (plus petit que le corps) : ignoré, octets réels comptés', async () => {
    const request = post('/x', streamed(jsonOfSize(10 * limit), 100), { 'content-length': '10' });

    await expect(readBodyText(request, limit)).rejects.toBeInstanceOf(PayloadTooLargeError);
  });

  it('corps vide ou invalide : SyntaxError comme request.json()', async () => {
    for (const body of ['', '{"a":', 'pas du json']) {
      const native = await post('/x', body).json().then(() => null, (e: unknown) => e);
      expect(native).toBeInstanceOf(SyntaxError);
      await expect(readJsonBody(post('/x', body), limit)).rejects.toBeInstanceOf(SyntaxError);
    }
    await expect(readJsonBody(post('/x', null), limit)).rejects.toBeInstanceOf(SyntaxError);
  });

  it('readJsonBodyOrNull : null pour vide ou invalide, erreur pour trop grand', async () => {
    await expect(readJsonBodyOrNull(post('/x', ''), limit)).resolves.toBeNull();
    await expect(readJsonBodyOrNull(post('/x', '{'), limit)).resolves.toBeNull();
    await expect(readJsonBodyOrNull(post('/x', '{"a":1}'), limit)).resolves.toEqual({ a: 1 });
    await expect(readJsonBodyOrNull(post('/x', jsonOfSize(limit + 1)), limit)).rejects.toBeInstanceOf(PayloadTooLargeError);
  });

  it('même résultat que request.json() pour un corps normal (UTF-8, BOM)', async () => {
    for (const body of ['{"nom":"Mariama Diallo","é":[1,2,{"x":null}]}', '﻿{"a":"b"}']) {
      expect(await readJsonBody(post('/x', body), limit)).toEqual(await post('/x', body).json());
    }
  });

  it('payloadTooLargeResponse : 413, format JSON habituel ; null pour une autre erreur', async () => {
    const response = payloadTooLargeResponse(new PayloadTooLargeError(1));

    expect(response?.status).toBe(413);
    expect(await response?.json()).toEqual({ success: false, message: PAYLOAD_TOO_LARGE_MESSAGE });
    expect(payloadTooLargeResponse(new SyntaxError('x'))).toBeNull();
  });
});

describe('routes réelles', () => {
  it('contact (64 Ko) : dépassement → 413 ; corps normal → validation inchangée', async () => {
    const tooBig = await contact(post('/api/contact', jsonOfSize(BODY_LIMITS.default + 1)));
    expect(tooBig.status).toBe(413);
    expect(await tooBig.json()).toEqual({ success: false, message: PAYLOAD_TOO_LARGE_MESSAGE });

    const invalid = await contact(post('/api/contact', JSON.stringify({ name: 'A' })));
    const body = await invalid.json();
    expect(invalid.status).toBe(400);
    expect(body).toMatchObject({ success: false, message: 'Données invalides' });
  });

  it('contact : corps à la limite → pas de 413 (validation)', async () => {
    const response = await contact(post('/api/contact', jsonOfSize(BODY_LIMITS.default)));

    expect(response.status).toBe(400);
  });

  it('events/ack (2 Mo) : limite acceptée, dépassement 413, sans Content-Length aussi', async () => {
    const atLimit = await eventsAck(post('/api/events/ack', jsonOfSize(BODY_LIMITS.sync), { 'x-api-key': KEY }));
    expect(atLimit.status).toBe(400);

    const over = await eventsAck(post('/api/events/ack', jsonOfSize(BODY_LIMITS.sync + 1), { 'x-api-key': KEY }));
    expect(over.status).toBe(413);
    expect(await over.json()).toEqual({ success: false, message: PAYLOAD_TOO_LARGE_MESSAGE });

    const streamedOver = await eventsAck(post('/api/events/ack', streamed(jsonOfSize(3 * 1024 * 1024)), { 'x-api-key': KEY }));
    expect(streamedOver.status).toBe(413);
  });

  it('events/ack : corps invalide → 400 comme avant ; sans clé → 401 avant toute lecture', async () => {
    expect((await eventsAck(post('/api/events/ack', 'pas du json', { 'x-api-key': KEY }))).status).toBe(400);
    expect((await eventsAck(post('/api/events/ack', jsonOfSize(BODY_LIMITS.sync + 1)))).status).toBe(401);
  });

  it('Auth.js POST : formulaire trop grand → 413 sans appeler Auth.js ; normal → délégué', async () => {
    const handler = vi.mocked(handlers.POST as unknown as (r: Request) => Promise<Response>);
    handler.mockClear();
    const form = (size: number) => `csrfToken=${'a'.repeat(size - 10)}`;

    const over = await authPost(post('/api/auth/signout', form(BODY_LIMITS.default + 1), { 'content-type': 'application/x-www-form-urlencoded' }));
    expect(over.status).toBe(413);
    expect(handler).not.toHaveBeenCalled();

    const normal = await authPost(post('/api/auth/signout', form(200), { 'content-type': 'application/x-www-form-urlencoded' }));
    expect(normal.status).toBe(302);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(await (handler.mock.calls[0][0] as Request).text()).toBe(form(200));
  });
});

describe('structure', () => {
  function routeFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      return statSync(full).isDirectory() ? routeFiles(full) : name === 'route.ts' ? [full] : [];
    });
  }

  it('aucune route ne lit son corps sans plafond', () => {
    const offenders = routeFiles(path.join(process.cwd(), 'app', 'api')).filter((file) =>
      /request\.(json|text|formData|arrayBuffer|blob)\(\)/.test(readFileSync(file, 'utf8').replace(/request\.clone\(\)\.formData\(\)/g, ''))
    );

    expect(offenders).toEqual([]);
  });

  it('les routes */sync et events/ack utilisent le plafond de 2 Mo, les autres 64 Ko', () => {
    for (const file of routeFiles(path.join(process.cwd(), 'app', 'api'))) {
      const source = readFileSync(file, 'utf8');
      if (!/readJsonBody(OrNull)?\(/.test(source)) continue;
      const sync = /[\\/]sync[\\/]route\.ts$|events[\\/]ack[\\/]route\.ts$/.test(file);

      expect(source.includes(sync ? 'BODY_LIMITS.sync' : 'BODY_LIMITS.default'), file).toBe(true);
      expect(source.includes(sync ? 'BODY_LIMITS.default' : 'BODY_LIMITS.sync'), file).toBe(false);
    }
  });
});
