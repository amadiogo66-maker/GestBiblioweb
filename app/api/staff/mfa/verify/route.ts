import type { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { logActivity } from '@/lib/activity-log';
import { decryptMfaSecret, isTotpFormat, matchTotpStep } from '@/lib/staff-mfa';
import { consumeRecoveryCode, consumeTotpStep } from '@/lib/staff-mfa-store';
import { setMfaProofCookie } from '@/lib/staff-mfa-session';
import { beginMfaRequest, mfaFailure } from '@/lib/staff-mfa-route';
import { mfaVerifySchema } from '@/schemas/staff-mfa';

export const runtime = 'nodejs';

/**
 * Vérification : code TOTP (pas consommé atomiquement, rejeu refusé) ou code
 * de secours (usage unique). Succès : preuve posée pour 12 h.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const begin = await beginMfaRequest(request);

  if (!begin.ok) {
    return begin.response;
  }

  const { user } = begin;

  try {
    const parsed = mfaVerifySchema.safeParse(await request.json().catch(() => null));

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const record = await prisma.staffMfa.findUnique({
      where: { userId: user.id },
      select: { enabledAt: true, secretCipher: true, epoch: true },
    });

    if (!record?.enabledAt || !record.secretCipher) {
      return jsonResponse({ success: false, message: "La double authentification n'est pas encore activée." }, 409);
    }

    const { code } = parsed.data;
    const method = isTotpFormat(code) ? 'totp' : 'recovery';
    let accepted = false;

    if (method === 'totp') {
      const step = matchTotpStep(decryptMfaSecret(record.secretCipher), code);
      accepted = step !== null && (await consumeTotpStep(prisma, user.id, step, 'enabled'));
    } else {
      accepted = await consumeRecoveryCode(prisma, user.id, code);
    }

    if (!accepted) {
      return mfaFailure(user.id, request, { stage: 'verification', method });
    }

    await logActivity({ action: 'auth.mfa.verify.success', userId: user.id, headers: request.headers, details: { method } });

    if (method === 'recovery') {
      await logActivity({ action: 'auth.mfa.recovery_used', userId: user.id, headers: request.headers });
    }

    const response = jsonResponse({ success: true, message: 'Vérification réussie.' });
    setMfaProofCookie(response, user.id, record.epoch);

    return response;
  } catch (error) {
    logger.error('MFA verification failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de vérifier le code' }, 500);
  }
}
