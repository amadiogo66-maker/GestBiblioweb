import QRCode from 'qrcode';
import type { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { buildOtpauthUri, encryptMfaSecret, generateTotpSecret } from '@/lib/staff-mfa';
import { isActivationCodeValid } from '@/lib/staff-mfa-store';
import { beginMfaRequest, mfaFailure, noStore } from '@/lib/staff-mfa-route';
import { mfaEnrollmentSchema } from '@/schemas/staff-mfa';

export const runtime = 'nodejs';

/**
 * Étape 1 de l'activation : le code d'activation (créé par staff:grant) est
 * vérifié SANS être consommé, puis un nouveau secret est généré, chiffré et
 * stocké en attente. La réponse contient le QR (SVG généré ici) et le secret
 * pour saisie manuelle ; rien de cela n'est journalisé.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const begin = await beginMfaRequest(request);

  if (!begin.ok) {
    return begin.response;
  }

  const { user } = begin;

  try {
    const parsed = mfaEnrollmentSchema.safeParse(await request.json().catch(() => null));

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const existing = await prisma.staffMfa.findUnique({ where: { userId: user.id }, select: { enabledAt: true } });

    if (existing?.enabledAt) {
      return jsonResponse({ success: false, message: 'La double authentification est déjà activée sur ce compte.' }, 409);
    }

    if (!(await isActivationCodeValid(prisma, user.id, parsed.data.activationCode))) {
      return mfaFailure(user.id, request, { stage: 'activation_code' });
    }

    const secret = generateTotpSecret();
    await prisma.staffMfa.upsert({
      where: { userId: user.id },
      create: { userId: user.id, secretCipher: encryptMfaSecret(secret) },
      update: { secretCipher: encryptMfaSecret(secret), enabledAt: null, lastUsedStep: null },
    });

    const svg = await QRCode.toString(buildOtpauthUri(secret, user.email), { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });

    return noStore(
      jsonResponse({
        success: true,
        data: { qrCode: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, secret },
      })
    );
  } catch (error) {
    logger.error('MFA enrollment failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: "Impossible de démarrer l'activation" }, 500);
  }
}
