import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MFA_PROOF_MAX_AGE_MS,
  buildOtpauthUri,
  createMfaProof,
  decryptMfaSecret,
  encryptMfaSecret,
  generateActivationCode,
  generateRecoveryCodes,
  generateTotpSecret,
  getMfaMasterKey,
  hashActivationCode,
  hashRecoveryCode,
  matchTotpStep,
  mfaProofCookieOptions,
  totpCodeForStep,
  totpStepAt,
  verifyMfaProof,
} from '@/lib/staff-mfa';

const NOW = Date.UTC(2026, 10, 22, 12, 0, 10);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('clé STAFF_MFA_KEY', () => {
  it('absente en production : erreur explicite, aucun repli', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STAFF_MFA_KEY', '');

    expect(() => getMfaMasterKey()).toThrow(/STAFF_MFA_KEY/);
    expect(() => encryptMfaSecret('ABC')).toThrow(/STAFF_MFA_KEY/);
    expect(() => createMfaProof('u', 1)).toThrow(/STAFF_MFA_KEY/);
  });

  it('longueur incorrecte : refusée', () => {
    vi.stubEnv('STAFF_MFA_KEY', randomBytes(16).toString('base64'));
    expect(() => getMfaMasterKey()).toThrow(/32 octets/);
  });
});

describe('chiffrement du secret', () => {
  it('AES-GCM : chiffré différent du clair, IV aléatoire, déchiffrement exact', () => {
    const secret = generateTotpSecret();
    const a = encryptMfaSecret(secret);
    const b = encryptMfaSecret(secret);

    expect(a).not.toContain(secret);
    expect(a).not.toBe(b);
    expect(decryptMfaSecret(a)).toBe(secret);
  });

  it('chiffré altéré ou autre clé : refus', () => {
    const cipher = Buffer.from(encryptMfaSecret(generateTotpSecret()), 'base64');
    const altered = Buffer.from(cipher);
    altered[altered.length - 1] ^= 1;
    expect(() => decryptMfaSecret(altered.toString('base64'))).toThrow();

    vi.stubEnv('STAFF_MFA_KEY', randomBytes(32).toString('base64'));
    expect(() => decryptMfaSecret(cipher.toString('base64'))).toThrow();
  });
});

describe('TOTP', () => {
  const secret = generateTotpSecret();
  const step = totpStepAt(NOW);

  it.each([-1, 0, 1])('décalage de %i pas : accepté', (delta) => {
    expect(matchTotpStep(secret, totpCodeForStep(secret, step + delta), NOW)).toBe(step + delta);
  });

  it.each([-2, 2])('décalage de %i pas : refusé', (delta) => {
    const code = totpCodeForStep(secret, step + delta);
    const inWindow = [-1, 0, 1].some((d) => totpCodeForStep(secret, step + d) === code);

    if (!inWindow) expect(matchTotpStep(secret, code, NOW)).toBeNull();
  });

  it('format invalide : refusé', () => {
    for (const code of ['', '12345', '1234567', 'abcdef']) expect(matchTotpStep(secret, code, NOW)).toBeNull();
  });

  it('URI otpauth : SHA1, 6 chiffres, 30 s', () => {
    const uri = buildOtpauthUri(secret, 'agent@test.local');

    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain('algorithm=SHA1');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });
});

describe('codes', () => {
  it('10 codes de secours distincts, hachage tolérant à la saisie et différent du clair', () => {
    const codes = generateRecoveryCodes();

    expect(new Set(codes).size).toBe(10);
    expect(hashRecoveryCode(codes[0])).toBe(hashRecoveryCode(` ${codes[0].toLowerCase().replace('-', '')} `));
    expect(hashRecoveryCode(codes[0])).not.toContain(codes[0]);
  });

  it('code d’activation : 20 caractères groupés, stocké haché', () => {
    const code = generateActivationCode();

    expect(code).toMatch(/^[A-Z2-7]{5}(-[A-Z2-7]{5}){3}$/);
    expect(hashActivationCode(code)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('preuve signée', () => {
  const enabledAt = new Date(NOW - 60_000);
  const expected = { userId: 'user-a', epoch: 3, enabledAt, nowMs: NOW };

  it('valide pour le bon utilisateur, la bonne époque', () => {
    expect(verifyMfaProof(createMfaProof('user-a', 3, NOW - 1000), expected)).toBe(true);
  });

  it('autre utilisateur, époque périmée : refus', () => {
    expect(verifyMfaProof(createMfaProof('user-b', 3, NOW), expected)).toBe(false);
    expect(verifyMfaProof(createMfaProof('user-a', 2, NOW), expected)).toBe(false);
  });

  it('charge ou signature altérée : refus', () => {
    const [payload, signature] = createMfaProof('user-a', 3, NOW).split('.');
    const forged = Buffer.from(JSON.stringify({ u: 'user-a', e: 3, iat: NOW + 1 })).toString('base64url');

    expect(verifyMfaProof(`${forged}.${signature}`, expected)).toBe(false);
    expect(verifyMfaProof(`${payload}.${signature.slice(0, -2)}xx`, expected)).toBe(false);
    expect(verifyMfaProof(payload, expected)).toBe(false);
    expect(verifyMfaProof(undefined, expected)).toBe(false);
  });

  it('âge ≥ 12 h : refus ; juste sous 12 h : accepté', () => {
    const old = { ...expected, enabledAt: new Date(NOW - 2 * MFA_PROOF_MAX_AGE_MS) };

    expect(verifyMfaProof(createMfaProof('user-a', 3, NOW - MFA_PROOF_MAX_AGE_MS), old)).toBe(false);
    expect(verifyMfaProof(createMfaProof('user-a', 3, NOW - MFA_PROOF_MAX_AGE_MS + 1000), old)).toBe(true);
  });

  it('antérieure à l’enrôlement courant, ou datée du futur : refus', () => {
    expect(verifyMfaProof(createMfaProof('user-a', 3, enabledAt.getTime() - 1), expected)).toBe(false);
    expect(verifyMfaProof(createMfaProof('user-a', 3, NOW + 120_000), expected)).toBe(false);
  });

  it('options du cookie : HttpOnly, Strict, Path=/, Secure en production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(mfaProofCookieOptions()).toEqual({ httpOnly: true, sameSite: 'strict', secure: true, path: '/', maxAge: 43_200 });
  });
});
