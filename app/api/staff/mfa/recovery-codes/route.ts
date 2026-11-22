import type { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { buildActivityLogData } from '@/lib/activity-log';
import { decryptMfaSecret, matchTotpStep } from '@/lib/staff-mfa';
import { consumeTotpStep, replaceRecoveryCodes } from '@/lib/staff-mfa-store';
import { beginMfaRequest, mfaFailure, noStore } from '@/lib/staff-mfa-route';
import { mfaRegenerateSchema } from '@/schemas/staff-mfa';

export const runtime = 'nodejs';

/**
 * Régénère les 10 codes de secours (les anciens sont invalidés). Exige la
 * double authentification déjà vérifiée ET un code TOTP valide non rejoué.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const begin = await beginMfaRequest(request, { verified: true });

  if (!begin.ok) {
    return begin.response;
  }

  const { user } = begin;

  try {
    const parsed = mfaRegenerateSchema.safeParse(await request.json().catch(() => null));

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const record = await prisma.staffMfa.findUniqueOrThrow({ where: { userId: user.id }, select: { secretCipher: true } });
    const step = matchTotpStep(decryptMfaSecret(record.secretCipher), parsed.data.code);

    if (step === null || !(await consumeTotpStep(prisma, user.id, step, 'enabled'))) {
      return mfaFailure(user.id, request, { stage: 'recovery_regeneration', method: 'totp' });
    }

    const recoveryCodes = await prisma.$transaction(async (tx) => {
      const codes = await replaceRecoveryCodes(tx, user.id);
      await tx.activityLog.create({
        data: buildActivityLogData({ action: 'auth.mfa.recovery_regenerated', userId: user.id, headers: request.headers }),
      });
      return codes;
    });

    return noStore(jsonResponse({ success: true, message: 'Nouveaux codes de secours générés.', data: { recoveryCodes } }));
  } catch (error) {
    logger.error('MFA recovery regeneration failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de régénérer les codes' }, 500);
  }
}
