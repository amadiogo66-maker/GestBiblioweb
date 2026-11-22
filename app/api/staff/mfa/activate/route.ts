import type { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { buildActivityLogData } from '@/lib/activity-log';
import { decryptMfaSecret, matchTotpStep } from '@/lib/staff-mfa';
import { consumeTotpStep, deleteActivationCodes, isActivationCodeValid, replaceRecoveryCodes } from '@/lib/staff-mfa-store';
import { setMfaProofCookie } from '@/lib/staff-mfa-session';
import { beginMfaRequest, mfaFailure, noStore } from '@/lib/staff-mfa-route';
import { mfaActivationSchema } from '@/schemas/staff-mfa';

export const runtime = 'nodejs';

class StepAlreadyUsedError extends Error {}

/**
 * Étape 2 : code d'activation (revérifié, puis CONSOMMÉ) + premier code TOTP.
 * Une transaction active la MFA, consomme le pas, remplace les codes de
 * secours et journalise auth.mfa.enrolled. La preuve (cookie) est posée.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const begin = await beginMfaRequest(request);

  if (!begin.ok) {
    return begin.response;
  }

  const { user } = begin;

  try {
    const parsed = mfaActivationSchema.safeParse(await request.json().catch(() => null));

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const pending = await prisma.staffMfa.findUnique({
      where: { userId: user.id },
      select: { enabledAt: true, secretCipher: true, epoch: true },
    });

    if (pending?.enabledAt) {
      return jsonResponse({ success: false, message: 'La double authentification est déjà activée sur ce compte.' }, 409);
    }

    if (!pending?.secretCipher) {
      return jsonResponse({ success: false, message: "Recommencez l'activation depuis le début." }, 409);
    }

    if (!(await isActivationCodeValid(prisma, user.id, parsed.data.activationCode))) {
      return mfaFailure(user.id, request, { stage: 'activation_code' });
    }

    const step = matchTotpStep(decryptMfaSecret(pending.secretCipher), parsed.data.code);

    if (step === null) {
      return mfaFailure(user.id, request, { stage: 'activation', method: 'totp' });
    }

    const recoveryCodes = await prisma.$transaction(async (tx) => {
      if (!(await consumeTotpStep(tx, user.id, step, 'enrollment'))) {
        throw new StepAlreadyUsedError();
      }

      await tx.staffMfa.update({ where: { userId: user.id }, data: { enabledAt: new Date() } });
      await deleteActivationCodes(tx, user.id);
      const codes = await replaceRecoveryCodes(tx, user.id);
      await tx.activityLog.create({
        data: buildActivityLogData({ action: 'auth.mfa.enrolled', userId: user.id, headers: request.headers, details: { method: 'totp' } }),
      });

      return codes;
    });

    const response = noStore(jsonResponse({ success: true, message: 'Double authentification activée.', data: { recoveryCodes } }));
    setMfaProofCookie(response, user.id, pending.epoch);

    return response;
  } catch (error) {
    if (error instanceof StepAlreadyUsedError) {
      return mfaFailure(user.id, request, { stage: 'activation', method: 'totp', reason: 'step_reused' });
    }

    logger.error('MFA activation failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: "Impossible d'activer la double authentification" }, 500);
  }
}
