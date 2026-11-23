import { NextResponse, type NextRequest } from 'next/server';
import { contactSchema } from '@/schemas/contact';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { enforceRateLimits, ipRateLimitKey } from '@/lib/rate-limit';
import { BODY_LIMITS, RATE_LIMITS } from '@/lib/constants';
import { payloadTooLargeResponse, readJsonBody } from '@/lib/json-body';
import { getClientIp } from '@/lib/client-ip';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const limited = await enforceRateLimits([
      { key: ipRateLimitKey('contact', request.headers), rule: RATE_LIMITS.contactIp },
    ]);

    if (limited) {
      return limited;
    }

    const payload = await readJsonBody(request, BODY_LIMITS.default);
    const parsed = contactSchema.safeParse(payload);

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    await prisma.activityLog.create({
      data: {
        action: 'contact.form',
        ipAddress: getClientIp(request.headers),
        userAgent: request.headers.get('user-agent'),
        details: {
          name: parsed.data.name,
          email: parsed.data.email,
          subject: parsed.data.subject,
        },
      },
    });

    return jsonResponse({ success: true, message: 'Message envoyé avec succès.' });
  } catch (error) {
    const tooLarge = payloadTooLargeResponse(error);

    if (tooLarge) {
      return tooLarge;
    }

    logger.error('Contact form failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible d’envoyer le message' }, 500);
  }
}
