import type { Prisma } from '@prisma/client';
import { NOTIFICATIONS_PAGE_SIZE } from '@/lib/constants';
import { notificationSelect } from '@/lib/notifications';
import { prisma } from '@/lib/prisma';

export type NotificationListItem = Prisma.NotificationGetPayload<{ select: typeof notificationSelect }>;

export interface NotificationPage {
  notifications: NotificationListItem[];
  /** Page réellement affichée : une page trop grande est ramenée à la dernière. */
  page: number;
  total: number;
  totalPages: number;
  unreadCount: number;
}

/** Notifications d'UN utilisateur, les plus récentes d'abord, 20 par page. */
export async function listUserNotifications(
  userId: string,
  query: { page: number; filter: 'all' | 'unread' }
): Promise<NotificationPage> {
  const where: Prisma.NotificationWhereInput = { userId, ...(query.filter === 'unread' ? { isRead: false } : {}) };
  const [total, unreadCount] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / NOTIFICATIONS_PAGE_SIZE));
  const page = Math.min(query.page, totalPages);
  const notifications = await prisma.notification.findMany({
    where,
    select: notificationSelect,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * NOTIFICATIONS_PAGE_SIZE,
    take: NOTIFICATIONS_PAGE_SIZE,
  });

  return { notifications, page, total, totalPages, unreadCount };
}
