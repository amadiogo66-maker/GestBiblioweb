import { describe, expect, it } from 'vitest';
import { evaluateModeration, type ModerationTarget } from '@/lib/staff-moderation';
import { isSameOriginRequest } from '@/lib/origin';
import { summarizeAuditDetails } from '@/lib/audit-format';

const admin = { id: 'admin', roles: ['ADMIN'] as const };
const librarian = { id: 'lib', roles: ['LIBRARIAN'] as const };
const NOW = new Date('2026-11-20T12:00:00Z');

function target(overrides: Partial<ModerationTarget> = {}): ModerationTarget {
  return { id: 'target', status: 'ACTIVE', hasActiveStaffRole: false, member: { inscriptionActive: true, dateExpiration: null }, ...overrides };
}

describe('evaluateModeration — matrice rôle × action', () => {
  it.each([
    ['LIBRARIAN', 'suspend', 'ACTIVE', true],
    ['LIBRARIAN', 'ban', 'ACTIVE', false],
    ['LIBRARIAN', 'reactivate', 'SUSPENDED', true],
    ['LIBRARIAN', 'reactivate', 'BANNED', false],
    ['ADMIN', 'suspend', 'ACTIVE', true],
    ['ADMIN', 'ban', 'ACTIVE', true],
    ['ADMIN', 'ban', 'SUSPENDED', true],
    ['ADMIN', 'reactivate', 'SUSPENDED', true],
    ['ADMIN', 'reactivate', 'BANNED', true],
  ] as const)('%s %s sur un compte %s → autorisé = %s', (role, action, status, expected) => {
    const actor = role === 'ADMIN' ? admin : librarian;
    expect(evaluateModeration(actor, target({ status }), action, NOW).allowed).toBe(expected);
  });

  it('états résultants : suspend → SUSPENDED, ban → BANNED, reactivate → ACTIVE', () => {
    expect(evaluateModeration(admin, target(), 'suspend', NOW)).toEqual({ allowed: true, nextStatus: 'SUSPENDED' });
    expect(evaluateModeration(admin, target(), 'ban', NOW)).toEqual({ allowed: true, nextStatus: 'BANNED' });
    expect(evaluateModeration(admin, target({ status: 'BANNED' }), 'reactivate', NOW)).toEqual({ allowed: true, nextStatus: 'ACTIVE' });
  });

  it('refus : auto-modération (403), compte du personnel (403), PENDING (409), sans rôle (403)', () => {
    expect(evaluateModeration(admin, target({ id: 'admin' }), 'suspend', NOW)).toMatchObject({ allowed: false, httpStatus: 403 });
    expect(evaluateModeration(admin, target({ hasActiveStaffRole: true }), 'suspend', NOW)).toMatchObject({ allowed: false, httpStatus: 403 });
    expect(evaluateModeration(admin, target({ status: 'PENDING' }), 'suspend', NOW)).toMatchObject({ allowed: false, httpStatus: 409 });
    expect(evaluateModeration({ id: 'x', roles: [] }, target(), 'suspend', NOW)).toMatchObject({ allowed: false, httpStatus: 403 });
  });

  it('409 : déjà suspendu ou banni (suspend), déjà banni (ban), déjà actif (reactivate)', () => {
    for (const status of ['SUSPENDED', 'BANNED'] as const) {
      expect(evaluateModeration(admin, target({ status }), 'suspend', NOW)).toMatchObject({ allowed: false, httpStatus: 409 });
    }
    expect(evaluateModeration(admin, target({ status: 'BANNED' }), 'ban', NOW)).toMatchObject({ allowed: false, httpStatus: 409 });
    expect(evaluateModeration(admin, target(), 'reactivate', NOW)).toMatchObject({ allowed: false, httpStatus: 409 });
  });

  it('réactivation refusée (409) si l’inscription est inactive ou expirée, acceptée sans membre lié', () => {
    const inactive = target({ status: 'SUSPENDED', member: { inscriptionActive: false, dateExpiration: null } });
    const expired = target({ status: 'SUSPENDED', member: { inscriptionActive: true, dateExpiration: new Date('2026-01-01') } });

    expect(evaluateModeration(admin, inactive, 'reactivate', NOW)).toMatchObject({ allowed: false, httpStatus: 409 });
    expect(evaluateModeration(admin, expired, 'reactivate', NOW)).toMatchObject({ allowed: false, httpStatus: 409 });
    expect(evaluateModeration(admin, target({ status: 'SUSPENDED', member: null }), 'reactivate', NOW).allowed).toBe(true);
  });
});

describe('isSameOriginRequest', () => {
  const headers = (entries: Record<string, string>) => new Headers(entries);

  it('accepte une origine identique à Host ou à x-forwarded-host', () => {
    expect(isSameOriginRequest(headers({ origin: 'http://localhost:3000', host: 'localhost:3000' }))).toBe(true);
    expect(
      isSameOriginRequest(headers({ origin: 'https://biblio.vercel.app', host: 'interne:3000', 'x-forwarded-host': 'biblio.vercel.app' }))
    ).toBe(true);
  });

  it('refuse Origin absent, illisible ou d’un autre hôte', () => {
    expect(isSameOriginRequest(headers({ host: 'localhost:3000' }))).toBe(false);
    expect(isSameOriginRequest(headers({ origin: 'null', host: 'localhost:3000' }))).toBe(false);
    expect(isSameOriginRequest(headers({ origin: 'https://evil.example', host: 'localhost:3000' }))).toBe(false);
    expect(isSameOriginRequest(headers({ origin: 'http://localhost:3001', host: 'localhost:3000' }))).toBe(false);
  });
});

describe('summarizeAuditDetails — liste blanche', () => {
  it('n’affiche que les clés autorisées (jamais hachage, email ni JSON brut)', () => {
    const summary = summarizeAuditDetails({
      statusBefore: 'ACTIVE',
      statusAfter: 'SUSPENDED',
      reason: 'Retards répétés',
      identifierHash: 'abc123',
      email: 'secret@example.com',
      nested: { password: 'x' },
    });

    expect(summary).toEqual([
      { label: 'Statut avant', value: 'Actif' },
      { label: 'Statut après', value: 'Suspendu' },
      { label: 'Motif', value: 'Retards répétés' },
    ]);
    expect(JSON.stringify(summary)).not.toMatch(/abc123|secret@|password/);
    expect(summarizeAuditDetails(null)).toEqual([]);
  });
});
