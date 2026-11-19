import { hash } from 'bcryptjs';
import { NextResponse, type NextRequest } from 'next/server';
import { resetPasswordSchema } from '@/schemas/auth';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { createPasswordResetIdentifier, hashToken } from '@/lib/tokens';
import { enforceRateLimits, ipRateLimitKey } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const limited = await enforceRateLimits([
      { key: ipRateLimitKey('reset-password', request.headers), rule: RATE_LIMITS.resetPasswordIp },
    ]);

    if (limited) {
      return limited;
    }

    const payload = await request.json();
    const parsed = resetPasswordSchema.safeParse(payload);

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const identifier = createPasswordResetIdentifier(parsed.data.email);
    const tokenHash = hashToken(parsed.data.token);
    const verificationToken = await prisma.verificationToken.findFirst({
      where: {
        identifier,
        token: tokenHash,
        expires: {
          gt: new Date(),
        },
      },
    });

    if (!verificationToken) {
      return jsonResponse(
        {
          success: false,
          message: 'Lien de réinitialisation invalide ou expiré',
          errors: { token: ['Lien de réinitialisation invalide ou expiré'] },
        },
        400
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true },
    });

    if (!user) {
      return jsonResponse(
        {
          success: false,
          message: 'Lien de réinitialisation invalide ou expiré',
          errors: { token: ['Lien de réinitialisation invalide ou expiré'] },
        },
        400
      );
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          password: await hash(parsed.data.password, 12),
        },
      }),
      prisma.verificationToken.deleteMany({
        where: { identifier },
      }),
      prisma.activityLog.create({
        data: {
          userId: user.id,
          action: 'auth.reset_password',
          ipAddress: request.headers.get('x-forwarded-for'),
          userAgent: request.headers.get('user-agent'),
        },
      }),
    ]);

    return jsonResponse({ success: true, message: 'Mot de passe réinitialisé' });
  } catch (error) {
    logger.error('Password reset failed', {
      error: error instanceof Error ? error.message : 'unknown error',
    });

    return jsonResponse({ success: false, message: 'Impossible de réinitialiser le mot de passe' }, 500);
  }
}

