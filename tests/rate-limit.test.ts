import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { getClientIp } from '@/lib/client-ip';
import { hashIdentifier } from '@/lib/tokens';
import { RATE_LIMIT_MESSAGE } from '@/lib/constants';
import { checkRateLimits, hitRateLimit, ipRateLimitKey, rateLimitKey, rateLimitedResponse } from '@/lib/rate-limit';
import { prisma } from './helpers/local-db';

describe('hachage des clés', () => {
  it('produit un SHA-256 hexadécimal, normalisé (casse, espaces)', () => {
    const hash = hashIdentifier('  ETU-2026-001 ');

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashIdentifier('etu-2026-001'));
    expect(hash).not.toBe(hashIdentifier('ETU-2026-002'));
  });

  it("ne place jamais l'identifiant brut dans la clé", () => {
    const matriculeKey = rateLimitKey('verify-member:matricule', 'ETU-2026-001');
    const emailKey = rateLimitKey('forgot-password:email', 'mariama.diallo@example.com');

    expect(matriculeKey).toMatch(/^verify-member:matricule:[0-9a-f]{64}$/);
    expect(matriculeKey.toLowerCase()).not.toContain('etu-2026-001');
    expect(emailKey).not.toContain('mariama');
    expect(emailKey).not.toContain('@');
  });

  it("hache aussi l'adresse IP", () => {
    const key = ipRateLimitKey('login', new Headers({ 'x-forwarded-for': '203.0.113.7' }));

    expect(key).toMatch(/^login:ip:[0-9a-f]{64}$/);
    expect(key).not.toContain('203.0.113.7');
  });
});

describe('getClientIp', () => {
  const originalVercel = process.env.VERCEL;

  afterEach(() => {
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
  });

  it('hors Vercel : première entrée de x-forwarded-for', () => {
    delete process.env.VERCEL;

    expect(getClientIp(new Headers({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' }))).toBe('198.51.100.1');
    expect(getClientIp(new Headers())).toBeNull();
  });

  it('sur Vercel : x-vercel-forwarded-for prime sur un x-forwarded-for fourni', () => {
    process.env.VERCEL = '1';

    const headers = new Headers({ 'x-forwarded-for': '1.2.3.4', 'x-vercel-forwarded-for': '198.51.100.9' });

    expect(getClientIp(headers)).toBe('198.51.100.9');
  });
});

describe('rateLimitedResponse', () => {
  it('renvoie 429, Retry-After et le message générique', async () => {
    const response = rateLimitedResponse(42);

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('42');
    expect(await response.json()).toEqual({ success: false, message: RATE_LIMIT_MESSAGE });
  });
});

describe('hitRateLimit (base locale)', () => {
  const prefix = `test-${randomUUID()}`;
  const rule = { limit: 3, windowMs: 60_000 };

  afterAll(async () => {
    await prisma.rateLimitBucket.deleteMany({ where: { key: { startsWith: prefix } } });
  });

  it('autorise jusqu’au seuil puis bloque, avec un délai cohérent', async () => {
    const key = `${prefix}:depassement`;
    const results = [];

    for (let i = 0; i < 4; i += 1) {
      results.push(await hitRateLimit(key, rule, { cleanupProbability: 0 }));
    }

    expect(results.map((result) => result.allowed)).toEqual([true, true, true, false]);
    expect(results.map((result) => result.count)).toEqual([1, 2, 3, 4]);
    expect(results[3].retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(results[3].retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('repart à 1 quand la fenêtre est expirée', async () => {
    const key = `${prefix}:expiree`;

    for (let i = 0; i < 4; i += 1) {
      await hitRateLimit(key, rule, { cleanupProbability: 0 });
    }

    await prisma.rateLimitBucket.update({
      where: { key },
      data: { windowStart: new Date(Date.now() - 2 * rule.windowMs) },
    });

    const result = await hitRateLimit(key, rule, { cleanupProbability: 0 });

    expect(result).toMatchObject({ allowed: true, count: 1 });
  });

  it('reste exact en concurrence (incrément atomique)', async () => {
    const key = `${prefix}:concurrence`;
    const results = await Promise.all(
      Array.from({ length: 25 }, () => hitRateLimit(key, { limit: 100, windowMs: 60_000 }, { cleanupProbability: 0 }))
    );

    expect(results.map((result) => result.count).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 25 }, (_, index) => index + 1)
    );
  });

  it('purge les compteurs expirés de façon opportuniste', async () => {
    const staleKey = `${prefix}:ancien`;

    await prisma.rateLimitBucket.create({
      data: { key: staleKey, count: 9, windowStart: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
    });
    await hitRateLimit(`${prefix}:declencheur`, rule, { cleanupProbability: 1 });

    expect(await prisma.rateLimitBucket.findUnique({ where: { key: staleKey } })).toBeNull();
  });

  it('checkRateLimits : null sous le seuil, plus long délai au-delà, clé stockée hachée', async () => {
    const email = `secret-${randomUUID()}@example.com`;
    const checks = [{ key: rateLimitKey(`${prefix}:email`, email), rule: { limit: 1, windowMs: 60_000 } }];

    expect(await checkRateLimits(checks)).toBeNull();

    const retryAfter = await checkRateLimits(checks);

    expect(retryAfter).toBeGreaterThanOrEqual(1);

    const stored = await prisma.rateLimitBucket.findMany({ where: { key: { startsWith: `${prefix}:email` } } });

    expect(stored).toHaveLength(1);
    expect(stored[0].key).not.toContain('secret');
    expect(stored[0].key).not.toContain('@');
  });
});
