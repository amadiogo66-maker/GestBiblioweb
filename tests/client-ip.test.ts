import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CLIENT_IP_HEADER, clientIpHeaderName, getClientIp } from '@/lib/client-ip';
import { ipRateLimitKey, rateLimitKey } from '@/lib/rate-limit';

const saved = { VERCEL: process.env.VERCEL, CLIENT_IP_HEADER: process.env.CLIENT_IP_HEADER };

function restore(name: keyof typeof saved): void {
  if (saved[name] === undefined) delete process.env[name];
  else process.env[name] = saved[name];
}

beforeEach(() => {
  delete process.env.VERCEL;
  delete process.env.CLIENT_IP_HEADER;
});

afterEach(() => {
  restore('VERCEL');
  restore('CLIENT_IP_HEADER');
});

describe('hors Vercel (serveur derrière Caddy)', () => {
  it('par défaut : x-forwarded-for', () => {
    expect(clientIpHeaderName()).toBe(DEFAULT_CLIENT_IP_HEADER);
    expect(DEFAULT_CLIENT_IP_HEADER).toBe('x-forwarded-for');
    expect(getClientIp(new Headers({ 'x-forwarded-for': '198.51.100.1' }))).toBe('198.51.100.1');
  });

  it('plusieurs valeurs : la dernière, écrite par le proxy le plus proche', () => {
    expect(getClientIp(new Headers({ 'x-forwarded-for': '1.2.3.4, 198.51.100.1' }))).toBe('198.51.100.1');
    expect(getClientIp(new Headers({ 'x-forwarded-for': ' 1.2.3.4 ,, 198.51.100.1 , ' }))).toBe('198.51.100.1');
  });

  it('en-tête falsifié par le client puis ajouté par un proxy : l’adresse du proxy est retenue', () => {
    const forged = ['203.0.113.1', '203.0.113.2', 'unknown', '10.0.0.1'];

    for (const value of forged) {
      expect(getClientIp(new Headers({ 'x-forwarded-for': `${value}, 192.0.2.50` }))).toBe('192.0.2.50');
    }
  });

  it('x-vercel-forwarded-for et x-real-ip ignorés hors Vercel', () => {
    const headers = new Headers({ 'x-vercel-forwarded-for': '1.2.3.4', 'x-real-ip': '5.6.7.8', 'x-forwarded-for': '198.51.100.1' });

    expect(getClientIp(headers)).toBe('198.51.100.1');
    expect(getClientIp(new Headers({ 'x-vercel-forwarded-for': '1.2.3.4', 'x-real-ip': '5.6.7.8' }))).toBeNull();
  });

  it('CLIENT_IP_HEADER : autre en-tête, casse et espaces ignorés', () => {
    process.env.CLIENT_IP_HEADER = '  X-Real-IP ';
    const headers = new Headers({ 'x-real-ip': '198.51.100.7', 'x-forwarded-for': '1.2.3.4' });

    expect(clientIpHeaderName()).toBe('x-real-ip');
    expect(getClientIp(headers)).toBe('198.51.100.7');
  });

  it('CLIENT_IP_HEADER vide : valeur par défaut', () => {
    process.env.CLIENT_IP_HEADER = '   ';

    expect(clientIpHeaderName()).toBe('x-forwarded-for');
  });

  it('IPv6 acceptée', () => {
    expect(getClientIp(new Headers({ 'x-forwarded-for': '2001:db8::1' }))).toBe('2001:db8::1');
  });

  it.each([
    ['en-tête absent', {}],
    ['en-tête vide', { 'x-forwarded-for': '' }],
    ['seulement des virgules', { 'x-forwarded-for': ' , , ' }],
    ['valeur qui n’est pas une IP', { 'x-forwarded-for': '1.2.3.4, unknown' }],
    ['adresse avec port', { 'x-forwarded-for': '198.51.100.1:443' }],
  ])('%s : null', (_label, init) => {
    expect(getClientIp(new Headers(init as Record<string, string>))).toBeNull();
  });

  it('nom d’en-tête invalide : null, jamais d’exception', () => {
    process.env.CLIENT_IP_HEADER = 'x forwarded';

    expect(clientIpHeaderName()).toBeNull();
    expect(getClientIp(new Headers({ 'x-forwarded-for': '198.51.100.1' }))).toBeNull();
  });

  it('sans adresse : compteur commun « unknown », la limitation reste active', () => {
    const key = rateLimitKey('login:ip', 'unknown');

    expect(ipRateLimitKey('login', new Headers())).toBe(key);
    expect(ipRateLimitKey('login', new Headers({ 'x-forwarded-for': 'pas-une-ip' }))).toBe(key);
  });
});

describe('sur Vercel', () => {
  it('x-vercel-forwarded-for prime sur un x-forwarded-for fourni', () => {
    process.env.VERCEL = '1';

    expect(getClientIp(new Headers({ 'x-forwarded-for': '1.2.3.4', 'x-vercel-forwarded-for': '198.51.100.9' }))).toBe('198.51.100.9');
  });

  it('CLIENT_IP_HEADER sans effet sur Vercel', () => {
    process.env.VERCEL = '1';
    process.env.CLIENT_IP_HEADER = 'x-real-ip';

    expect(getClientIp(new Headers({ 'x-real-ip': '5.6.7.8', 'x-vercel-forwarded-for': '198.51.100.9' }))).toBe('198.51.100.9');
  });

  it('repli : x-real-ip puis x-forwarded-for (première valeur)', () => {
    process.env.VERCEL = '1';

    expect(getClientIp(new Headers({ 'x-real-ip': '198.51.100.3', 'x-forwarded-for': '1.2.3.4' }))).toBe('198.51.100.3');
    expect(getClientIp(new Headers({ 'x-forwarded-for': '198.51.100.4, 10.0.0.1' }))).toBe('198.51.100.4');
  });
});
