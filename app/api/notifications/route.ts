import { UserStatus } from '@prisma/client';
import { NextResponse, type NextRequest } from 'next/server';
import { getAuthenticatedUser, jsonResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { notificationSelect } from '@/lib/notifications';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  try {
    const user = await getAuthenticatedUser();

    if (!user || user.status !== UserStatus.ACTIVE) {
      return jsonResponse({ success: false, message: 'Non authentifié' }, 401);
    }

    const notifications = await prisma.notification.findMany({
      where: { userId: user.id },
      select: notificationSelect,
      orderBy: { createdAt: 'desc' },
    });

    return jsonResponse({ success: true, data: notifications });
  } catch (error) {
    logger.error('Notification list failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de récupérer les notifications' }, 500);
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getAuthenticatedUser();

    if (!user || user.status !== UserStatus.ACTIVE) {
      return jsonResponse({ success: false, message: 'Non authentifié' }, 401);
    }

    const result = await prisma.notification.updateMany({
      where: {
        userId: user.id,
        isRead: false,
      },
      data: { isRead: true },
    });

    if (result.count > 0) {
      await prisma.activityLog.create({
        data: {
          userId: user.id,
          action: 'notification.read_all',
          ipAddress: request.headers.get('x-forwarded-for'),
          userAgent: request.headers.get('user-agent'),
          details: { count: result.count },
        },
      });
    }

    return jsonResponse({
      success: true,
      message: 'Notifications marquées comme lues',
      data: { count: result.count },
    });
  } catch (error) {
    logger.error('Mark all notifications read failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de marquer les notifications comme lues' }, 500);
  }
}

