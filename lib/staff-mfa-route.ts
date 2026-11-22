import type { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { jsonResponse } from '@/lib/api';
import { rejectCrossOrigin, requireStaff, requireStaffIdentity } from '@/lib/authz';
import { logActivity } from '@/lib/activity-log';
import { mfaRateLimitResponse, recordMfaFailure } from '@/lib/staff-mfa-session';
import type { PublicUser } from '@/lib/user-select';
import type { ApiResponse } from '@/types';

/** Message unique pour tout code refusé (ne révèle pas lequel des contrôles a échoué). */
export const MFA_INVALID_CODE_MESSAGE = 'Code invalide ou expiré.';

type Begin = { ok: true; user: PublicUser } | { ok: false; response: NextResponse<ApiResponse<never>> };

/**
 * Préambule commun des routes /api/staff/mfa/* : Origin → personnel actif
 * (relu en base) → 429 si le compte ou l'IP a épuisé ses échecs.
 * `verified: true` exige en plus la double authentification déjà vérifiée.
 */
export async function beginMfaRequest(request: Request, options: { verified?: boolean } = {}): Promise<Begin> {
  const crossOrigin = rejectCrossOrigin(request);

  if (crossOrigin) {
    return { ok: false, response: crossOrigin };
  }

  const staff = options.verified ? await requireStaff() : await requireStaffIdentity();

  if (!staff.ok) {
    return staff;
  }

  const limited = await mfaRateLimitResponse(staff.user.id, request.headers);

  return limited ? { ok: false, response: limited } : { ok: true, user: staff.user };
}

/** Échec : comptabilisé (compte et IP), journalisé SANS le code, réponse générique. */
export async function mfaFailure(
  userId: string,
  request: Request,
  details: Prisma.InputJsonValue
): Promise<NextResponse<ApiResponse<never>>> {
  await recordMfaFailure(userId, request.headers);
  await logActivity({ action: 'auth.mfa.verify.failed', userId, headers: request.headers, details });

  return jsonResponse({ success: false, message: MFA_INVALID_CODE_MESSAGE }, 400);
}

/** Les réponses contenant un secret ou des codes ne doivent jamais être mises en cache. */
export function noStore<T extends NextResponse>(response: T): T {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
