import { NextResponse } from 'next/server';
import { jsonResponse } from '@/lib/api';
import { requireActiveUser } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  try {
    const authz = await requireActiveUser();

    if (!authz.ok) {
      return authz.response;
    }

    const { user } = authz;

    const unreadCount = await prisma.notification.count({
      where: {
        userId: user.id,
        isRead: false,
      },
    });

    return jsonResponse({
      success: true,
      data: { unreadCount },
    });
  } catch (error) {
    logger.error('Unread notification count failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de récupérer le nombre de notifications' }, 500);
  }
}

