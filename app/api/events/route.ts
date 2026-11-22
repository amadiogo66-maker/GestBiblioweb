import { NextResponse, type NextRequest } from 'next/server';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { rejectInvalidApiKey } from '@/lib/api-key';
import { logActivity } from '@/lib/activity-log';
import { recordCirculationContact } from '@/lib/circulation-status';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { eventsQuerySchema } from '@/schemas/circulation-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Événements NON traités avec seq > after, par seq croissant. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const rejectedKey = rejectInvalidApiKey(request);

  if (rejectedKey) {
    return rejectedKey;
  }

  await recordCirculationContact();

  try {
    const parsed = eventsQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const { after, limit } = parsed.data;
    const events = await prisma.siteEvent.findMany({
      where: { processedAt: null, seq: { gt: after } },
      select: { seq: true, type: true, createdAt: true, payload: true },
      orderBy: { seq: 'asc' },
      take: limit,
    });

    // Une lecture vide n'est pas journalisée : le logiciel interroge en continu.
    if (events.length > 0) {
      await logActivity({ action: 'events.read', details: { count: events.length } });
    }

    return jsonResponse({ success: true, data: { events, nextAfter: events.at(-1)?.seq ?? after } });
  } catch (error) {
    logger.error('Events read failed', { error: error instanceof Error ? error.message : 'unknown error' });
    await logActivity({ action: 'events.read.error' });
    return jsonResponse({ success: false, message: 'Impossible de lire les événements' }, 500);
  }
}
