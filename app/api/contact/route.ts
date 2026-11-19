import { NextResponse, type NextRequest } from 'next/server';
import { contactSchema } from '@/schemas/contact';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { enforceRateLimits, ipRateLimitKey } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const limited = await enforceRateLimits([
      { key: ipRateLimitKey('contact', request.headers), rule: RATE_LIMITS.contactIp },
    ]);

    if (limited) {
      return limited;
    }

    const payload = await request.json();
    const parsed = contactSchema.safeParse(payload);

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    await prisma.activityLog.create({
      data: {
        action: 'contact.form',
        ipAddress: request.headers.get('x-forwarded-for'),
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
    logger.error('Contact form failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible d’envoyer le message' }, 500);
  }
}
