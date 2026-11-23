import { NextResponse, type NextRequest } from 'next/server';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { rejectInvalidApiKey } from '@/lib/api-key';
import { logActivity } from '@/lib/activity-log';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { eventsAckSchema } from '@/schemas/circulation-sync';
import { BODY_LIMITS } from '@/lib/constants';
import { payloadTooLargeResponse, readJsonBodyOrNull } from '@/lib/json-body';

export const runtime = 'nodejs';

/** Marque des événements comme traités. Idempotent : seuls les non traités changent. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rejectedKey = rejectInvalidApiKey(request);

  if (rejectedKey) {
    return rejectedKey;
  }

  try {
    const parsed = eventsAckSchema.safeParse(await readJsonBodyOrNull(request, BODY_LIMITS.sync));

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const seq = 'upToSeq' in parsed.data ? { lte: parsed.data.upToSeq } : { in: parsed.data.seqs };
    const { count: acknowledged } = await prisma.siteEvent.updateMany({
      where: { processedAt: null, seq },
      data: { processedAt: new Date() },
    });

    await logActivity({ action: 'events.ack', details: { acknowledged } });

    return jsonResponse({ success: true, message: `${acknowledged} événement(s) acquitté(s)`, data: { acknowledged } });
  } catch (error) {
    const tooLarge = payloadTooLargeResponse(error);

    if (tooLarge) {
      return tooLarge;
    }

    logger.error('Events ack failed', { error: error instanceof Error ? error.message : 'unknown error' });
    await logActivity({ action: 'events.ack.error' });
    return jsonResponse({ success: false, message: 'Impossible d’acquitter les événements' }, 500);
  }
}
