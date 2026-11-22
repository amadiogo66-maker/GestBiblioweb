import { NextResponse, type NextRequest } from 'next/server';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { rejectInvalidApiKey } from '@/lib/api-key';
import { logActivity } from '@/lib/activity-log';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { eventsAckSchema } from '@/schemas/circulation-sync';

export const runtime = 'nodejs';

/** Marque des événements comme traités. Idempotent : seuls les non traités changent. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rejectedKey = rejectInvalidApiKey(request);

  if (rejectedKey) {
    return rejectedKey;
  }

  try {
    const parsed = eventsAckSchema.safeParse(await request.json().catch(() => null));

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
    logger.error('Events ack failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible d’acquitter les événements' }, 500);
  }
}
