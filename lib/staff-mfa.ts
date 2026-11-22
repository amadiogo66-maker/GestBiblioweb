import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'crypto';
import { Secret, TOTP } from 'otpauth';
import { hashToken } from '@/lib/tokens';

/**
 * Double authentification TOTP du personnel — primitives pures (aucun accès à
 * la base ni à Next) : clé, chiffrement du secret, TOTP, codes de secours,
 * codes d'activation et preuve signée (cookie).
 *
 * Aucune fonction ne journalise un secret ou un code.
 */

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
export const TOTP_WINDOW = 1;
export const TOTP_ISSUER = 'Gest Biblio';
export const MFA_PROOF_COOKIE = 'staff_mfa';
export const MFA_PROOF_MAX_AGE_MS = 12 * 60 * 60 * 1000;
export const RECOVERY_CODE_COUNT = 10;
export const ACTIVATION_CODE_TTL_MS = 24 * 60 * 60 * 1000;

// --- Clé maîtresse et clés dérivées -------------------------------------------

/**
 * Clé maîtresse STAFF_MFA_KEY : 32 octets encodés en base64. Absente ou
 * invalide : erreur explicite (jamais de clé de repli, quel que soit l'environnement).
 */
export function getMfaMasterKey(): Buffer {
  const raw = process.env.STAFF_MFA_KEY?.trim();
  const key = raw ? Buffer.from(raw, 'base64') : null;

  if (!key || key.length !== 32) {
    throw new Error('STAFF_MFA_KEY absente ou invalide : 32 octets encodés en base64 sont requis.');
  }

  return key;
}

type KeyPurpose = 'secret-encryption' | 'proof-cookie' | 'recovery-code';

/** Clés indépendantes par usage (HKDF-SHA256, étiquettes distinctes). */
function deriveKey(purpose: KeyPurpose): Buffer {
  return Buffer.from(hkdfSync('sha256', getMfaMasterKey(), Buffer.alloc(0), `gestbiblio:staff-mfa:${purpose}:v1`, 32));
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  return left.length === right.length && timingSafeEqual(left, right);
}

// --- Chiffrement du secret TOTP (AES-256-GCM) ---------------------------------

/** Chiffre le secret : base64(iv[12] + tag[16] + chiffré). */
export function encryptMfaSecret(secretBase32: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey('secret-encryption'), iv);
  const encrypted = Buffer.concat([cipher.update(secretBase32, 'utf8'), cipher.final()]);

  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

export function decryptMfaSecret(secretCipher: string): string {
  const data = Buffer.from(secretCipher, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', deriveKey('secret-encryption'), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));

  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
}

// --- TOTP (RFC 6238 : SHA-1, 6 chiffres, pas de 30 s) -------------------------

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

function totpFor(secretBase32: string, label = ''): TOTP {
  return new TOTP({
    issuer: TOTP_ISSUER,
    label,
    algorithm: 'SHA1',
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
    secret: Secret.fromBase32(secretBase32),
  });
}

/** URI otpauth:// à encoder dans le QR (contient le secret : ne jamais la journaliser). */
export function buildOtpauthUri(secretBase32: string, accountLabel: string): string {
  return totpFor(secretBase32, accountLabel).toString();
}

export function totpStepAt(timestampMs: number): number {
  return Math.floor(timestampMs / (TOTP_PERIOD_SECONDS * 1000));
}

/** Code attendu pour un pas donné (utilisé par les tests et le contrôle). */
export function totpCodeForStep(secretBase32: string, step: number): string {
  return totpFor(secretBase32).generate({ timestamp: step * TOTP_PERIOD_SECONDS * 1000 });
}

export function isTotpFormat(code: string): boolean {
  return /^\d{6}$/.test(code);
}

/**
 * Pas correspondant au code dans la fenêtre ±TOTP_WINDOW, ou null.
 * Toute la fenêtre est comparée (temps constant, sans sortie anticipée).
 */
export function matchTotpStep(secretBase32: string, code: string, nowMs = Date.now()): number | null {
  if (!isTotpFormat(code)) {
    return null;
  }

  const current = totpStepAt(nowMs);
  let matched: number | null = null;

  for (let delta = -TOTP_WINDOW; delta <= TOTP_WINDOW; delta += 1) {
    if (safeEqual(totpCodeForStep(secretBase32, current + delta), code)) {
      matched = current + delta;
    }
  }

  return matched;
}

// --- Codes aléatoires (secours, activation) -----------------------------------

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function randomBase32(length: number): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (byte) => BASE32[byte & 31]).join('');
}

function group(code: string, size = 5): string {
  return code.match(new RegExp(`.{1,${size}}`, 'g'))!.join('-');
}

/** Majuscules, sans espaces ni tirets : la saisie est tolérante. */
export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** 10 codes de secours de 10 caractères (≈ 50 bits), ex. ABCDE-FGH2J. */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => group(randomBase32(10)));
}

/** Haché à clé (HMAC) : une fuite de la base seule ne permet pas de tester des codes. */
export function hashRecoveryCode(code: string): string {
  return createHmac('sha256', deriveKey('recovery-code')).update(normalizeCode(code)).digest('hex');
}

/** Code d'activation de 20 caractères (≈ 100 bits), ex. ABCDE-FGHIJ-KLMNO-PQRST. */
export function generateActivationCode(): string {
  return group(randomBase32(20));
}

/** Haché SHA-256 (stocké dans VerificationToken) ; ne dépend pas de STAFF_MFA_KEY. */
export function hashActivationCode(code: string): string {
  return hashToken(normalizeCode(code));
}

// --- Preuve de vérification (cookie signé) ------------------------------------

interface ProofPayload {
  /** Identifiant de l'utilisateur. */
  u: string;
  /** Époque MFA au moment de la vérification. */
  e: number;
  /** Date d'émission, en millisecondes. */
  iat: number;
}

function sign(payload: string): string {
  return createHmac('sha256', deriveKey('proof-cookie')).update(payload).digest('base64url');
}

export function createMfaProof(userId: string, epoch: number, nowMs = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, e: epoch, iat: nowMs } satisfies ProofPayload)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export interface ProofExpectation {
  userId: string;
  epoch: number;
  /** Une preuve antérieure à l'enrôlement en cours est refusée. */
  enabledAt: Date;
  nowMs?: number;
}

/** Signature, utilisateur, époque, âge (< 12 h) et postériorité à l'enrôlement. */
export function verifyMfaProof(token: string | undefined, expected: ProofExpectation): boolean {
  if (!token) return false;

  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined || !safeEqual(sign(payload), signature)) return false;

  let data: Partial<ProofPayload>;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<ProofPayload>;
  } catch {
    return false;
  }

  const now = expected.nowMs ?? Date.now();

  return (
    data.u === expected.userId &&
    data.e === expected.epoch &&
    typeof data.iat === 'number' &&
    data.iat >= expected.enabledAt.getTime() &&
    data.iat <= now + 60_000 &&
    now - data.iat < MFA_PROOF_MAX_AGE_MS
  );
}

export function mfaProofCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MFA_PROOF_MAX_AGE_MS / 1000,
  };
}
