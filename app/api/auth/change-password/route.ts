import { compare, hash } from 'bcryptjs';
import { NextResponse, type NextRequest } from 'next/server';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { rejectCrossOrigin, requireActiveUser } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { changePasswordSchema } from '@/schemas/user';
import { BODY_LIMITS } from '@/lib/constants';
import { payloadTooLargeResponse, readJsonBody } from '@/lib/json-body';

export const runtime = 'nodejs';

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const crossOrigin = rejectCrossOrigin(request);

  if (crossOrigin) {
    return crossOrigin;
  }

  try {
    const authz = await requireActiveUser();

    if (!authz.ok) {
      return authz.response;
    }

    const { user } = authz;

    const payload = await readJsonBody(request, BODY_LIMITS.default);
    const parsed = changePasswordSchema.safeParse(payload);

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    // Requête dédiée au hachage : les helpers d'autorisation ne le chargent jamais.
    const credentials = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { password: true } });
    const isCurrentPasswordValid = await compare(parsed.data.currentPassword, credentials.password);

    if (!isCurrentPasswordValid) {
      return jsonResponse(
        {
          success: false,
          message: 'Mot de passe actuel incorrect',
          errors: { currentPassword: ['Mot de passe actuel incorrect'] },
        },
        400
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: await hash(parsed.data.newPassword, 12),
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: 'auth.change_password',
      },
    });

    return jsonResponse({ success: true, message: 'Mot de passe mis à jour' });
  } catch (error) {
    const tooLarge = payloadTooLargeResponse(error);

    if (tooLarge) {
      return tooLarge;
    }

    logger.error('Password change failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de modifier le mot de passe' }, 500);
  }
}
