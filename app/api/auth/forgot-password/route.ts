import { NextResponse, type NextRequest } from 'next/server';
import { forgotPasswordSchema } from '@/schemas/auth';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { createPasswordResetIdentifier, createSecureToken, hashToken } from '@/lib/tokens';
import { enforceRateLimits, ipRateLimitKey, rateLimitKey } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';

export const runtime = 'nodejs';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const GENERIC_MESSAGE = 'Si un compte existe avec cet email, un lien de réinitialisation a été généré.';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const ipLimited = await enforceRateLimits([
      { key: ipRateLimitKey('forgot-password', request.headers), rule: RATE_LIMITS.forgotPasswordIp },
    ]);

    if (ipLimited) {
      return ipLimited;
    }

    const payload = await request.json();
    const parsed = forgotPasswordSchema.safeParse(payload);

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    // Compté avant la recherche du compte : même comportement qu'il existe ou non.
    const emailLimited = await enforceRateLimits([
      { key: rateLimitKey('forgot-password:email', parsed.data.email), rule: RATE_LIMITS.forgotPasswordEmail },
    ]);

    if (emailLimited) {
      return emailLimited;
    }

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: {
        id: true,
        email: true,
        status: true,
      },
    });

    if (!user || user.status === 'BANNED') {
      return jsonResponse({ success: true, message: GENERIC_MESSAGE });
    }

    const resetToken = createSecureToken();
    const identifier = createPasswordResetIdentifier(user.email);
    const expires = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await prisma.$transaction([
      prisma.verificationToken.deleteMany({
        where: { identifier },
      }),
      prisma.verificationToken.create({
        data: {
          identifier,
          token: hashToken(resetToken),
          expires,
        },
      }),
      prisma.activityLog.create({
        data: {
          userId: user.id,
          action: 'auth.forgot_password',
          ipAddress: request.headers.get('x-forwarded-for'),
          userAgent: request.headers.get('user-agent'),
        },
      }),
    ]);

    return jsonResponse({
      success: true,
      message: GENERIC_MESSAGE,
      data: process.env.NODE_ENV === 'production' ? undefined : { resetToken, expires },
    });
  } catch (error) {
    logger.error('Forgot password request failed', {
      error: error instanceof Error ? error.message : 'unknown error',
    });

    return jsonResponse({ success: false, message: 'Impossible de traiter la demande' }, 500);
  }
}

