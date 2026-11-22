import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkRateLimits, getRateLimitRetryAfter, ipRateLimitKey, rateLimitKey, rateLimitedResponse } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';
import { MFA_PROOF_COOKIE, createMfaProof, mfaProofCookieOptions, verifyMfaProof } from '@/lib/staff-mfa';
import type { ApiResponse } from '@/types';

/**
 * État de la double authentification pour la requête courante (cookie de
 * preuve + base), et pose/suppression du cookie de preuve.
 */

export type StaffMfaState = 'not_enrolled' | 'not_verified' | 'verified';

export const MFA_ROUTES = {
  security: '/personnel/securite',
  activation: '/personnel/securite/activation',
  verification: '/personnel/securite/verification',
} as const;

export interface MfaRecordForState {
  enabledAt: Date | null;
  epoch: number;
}

/** Calcul pur : aucune MFA active → not_enrolled ; preuve valide → verified. */
export function computeMfaState(userId: string, record: MfaRecordForState | null, proof: string | undefined): StaffMfaState {
  if (!record?.enabledAt) {
    return 'not_enrolled';
  }

  return verifyMfaProof(proof, { userId, epoch: record.epoch, enabledAt: record.enabledAt }) ? 'verified' : 'not_verified';
}

export async function readMfaProofCookie(): Promise<string | undefined> {
  return (await cookies()).get(MFA_PROOF_COOKIE)?.value;
}

/** Relit la base (activation, époque) et le cookie de la requête. */
export async function getStaffMfaState(userId: string): Promise<StaffMfaState> {
  const [record, proof] = await Promise.all([
    prisma.staffMfa.findUnique({ where: { userId }, select: { enabledAt: true, epoch: true } }),
    readMfaProofCookie(),
  ]);

  return computeMfaState(userId, record, proof);
}

/** Pose la preuve après une vérification réussie (12 h, HttpOnly, SameSite=Strict). */
export function setMfaProofCookie(response: NextResponse, userId: string, epoch: number): void {
  response.cookies.set(MFA_PROOF_COOKIE, createMfaProof(userId, epoch), mfaProofCookieOptions());
}

/** En-tête Set-Cookie qui efface la preuve (utilisé à la déconnexion). */
export function clearedMfaProofCookieHeader(): string {
  const { secure } = mfaProofCookieOptions();
  return `${MFA_PROOF_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
}

// --- Limitation : 5 échecs / 15 min par compte, 20 / 15 min par IP ------------

function mfaLimitChecks(userId: string, headers: Headers) {
  return [
    { key: rateLimitKey('mfa-failures:user', userId), rule: RATE_LIMITS.mfaFailuresUser },
    { key: ipRateLimitKey('mfa-failures', headers), rule: RATE_LIMITS.mfaFailuresIp },
  ];
}

/** 429 générique si le compte ou l'IP a déjà épuisé ses échecs, sinon null. */
export async function mfaRateLimitResponse(userId: string, headers: Headers): Promise<NextResponse<ApiResponse<never>> | null> {
  const delays = await Promise.all(mfaLimitChecks(userId, headers).map((check) => getRateLimitRetryAfter(check.key, check.rule)));
  const blocked = delays.filter((delay): delay is number => delay !== null);

  return blocked.length > 0 ? rateLimitedResponse(Math.max(...blocked)) : null;
}

/** Comptabilise un échec (compte et IP). */
export async function recordMfaFailure(userId: string, headers: Headers): Promise<void> {
  await checkRateLimits(mfaLimitChecks(userId, headers));
}
