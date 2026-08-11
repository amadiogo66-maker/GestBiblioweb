import { UserStatus } from '@prisma/client';
import { NextResponse, type NextRequest } from 'next/server';
import { getAuthenticatedUser, jsonResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { notificationSelect } from '@/lib/notifications';

export const runtime = 'nodejs';

interface ReadNotificationRouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function PATCH(request: NextRequest, context: ReadNotificationRouteContext): Promise<NextResponse> {
  try {
    const user = await getAuthenticatedUser();

    if (!user || user.status !== UserStatus.ACTIVE) {
      return jsonResponse({ success: false, message: 'Non authentifié' }, 401);
    }

    const { id } = await context.params;
    const notification = await prisma.notification.findFirst({
      where: {
        id,
        userId: user.id,
      },
      select: { id: true, isRead: true },
    });

    if (!notification) {
      return jsonResponse({ success: false, message: 'Notification introuvable' }, 404);
    }

    const updatedNotification = notification.isRead
      ? await prisma.notification.findUniqueOrThrow({
          where: { id: notification.id },
          select: notificationSelect,
        })
      : await prisma.notification.update({
          where: { id: notification.id },
          data: { isRead: true },
          select: notificationSelect,
        });

    if (!notification.isRead) {
      await prisma.activityLog.create({
        data: {
          userId: user.id,
          action: 'notification.read',
          ipAddress: request.headers.get('x-forwarded-for'),
          userAgent: request.headers.get('user-agent'),
          details: { notificationId: updatedNotification.id },
        },
      });
    }

    return jsonResponse({ success: true, message: 'Notification marquée comme lue', data: updatedNotification });
  } catch (error) {
    logger.error('Mark notification read failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de marquer la notification comme lue' }, 500);
  }
}

