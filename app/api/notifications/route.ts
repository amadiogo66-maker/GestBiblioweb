import { UserStatus, type Prisma } from '@prisma/client';
import { NextResponse, type NextRequest } from 'next/server';
import { listNotificationsSchema } from '@/schemas/notification';
import { getAuthenticatedUser, jsonResponse, validationErrorResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { notificationSelect } from '@/lib/notifications';
import type { PaginatedResponse } from '@/types';

export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getAuthenticatedUser();

    if (!user || user.status !== UserStatus.ACTIVE) {
      return jsonResponse({ success: false, message: 'Non authentifié' }, 401);
    }

    const query = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = listNotificationsSchema.safeParse(query);

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const { page, limit, type, isRead } = parsed.data;
    const where: Prisma.NotificationWhereInput = {
      userId: user.id,
      ...(type ? { type } : {}),
      ...(isRead !== undefined ? { isRead } : {}),
    };
    const skip = (page - 1) * limit;
    const [notifications, total, unreadCount] = await prisma.$transaction([
      prisma.notification.findMany({
        where,
        select: notificationSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: {
          userId: user.id,
          isRead: false,
        },
      }),
    ]);
    const totalPages = Math.ceil(total / limit);

    return jsonResponse<PaginatedResponse<(typeof notifications)[number]> & { unreadCount: number }>({
      success: true,
      data: {
        data: notifications,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
        unreadCount,
      },
    });
  } catch (error) {
    logger.error('Notification list failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de récupérer les notifications' }, 500);
  }
}

