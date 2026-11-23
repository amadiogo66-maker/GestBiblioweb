import { NextResponse, type NextRequest } from 'next/server';
import { jsonResponse } from '@/lib/api';
import { rejectCrossOrigin, requireActiveUser } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { notificationSelect } from '@/lib/notifications';
import { getClientIp } from '@/lib/client-ip';

export const runtime = 'nodejs';

interface ReadNotificationRouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function PATCH(request: NextRequest, context: ReadNotificationRouteContext): Promise<NextResponse> {
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
          ipAddress: getClientIp(request.headers),
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

