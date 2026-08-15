import { timingSafeEqual } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { notificationSyncSchema } from '@/schemas/notification';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { notificationSelect } from '@/lib/notifications';

export const runtime = 'nodejs';

function isValidApiKey(apiKey: string | null): boolean {
  const expectedApiKey = process.env.GEST_BIBLIO_API_KEY;

  if (!apiKey || !expectedApiKey) {
    return false;
  }

  const provided = Buffer.from(apiKey);
  const expected = Buffer.from(expectedApiKey);

  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!process.env.GEST_BIBLIO_API_KEY) {
    logger.error('Gest Biblio notification sync API key is not configured');
    return jsonResponse({ success: false, message: 'Synchronisation indisponible' }, 500);
  }

  if (!isValidApiKey(request.headers.get('x-api-key'))) {
    return jsonResponse({ success: false, message: 'Clé API invalide' }, 401);
  }

  try {
    const payload = await request.json();
    const parsed = notificationSyncSchema.safeParse(payload);

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const { userId, type, title, message, isRead } = parsed.data;
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!targetUser) {
      return jsonResponse({ success: false, message: 'Utilisateur introuvable' }, 404);
    }

    const notification = await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        isRead,
      },
      select: notificationSelect,
    });

    await prisma.activityLog.create({
      data: {
        userId: targetUser.id,
        action: 'notification.sync.create',
        ipAddress: request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent'),
        details: {
          notificationId: notification.id,
          type: notification.type,
        },
      },
    });

    return jsonResponse({
      success: true,
      message: 'Notification synchronisée',
      data: notification,
    });
  } catch (error) {
    logger.error('Notification sync failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de synchroniser la notification' }, 500);
  }
}
