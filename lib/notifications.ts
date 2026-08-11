import type { Prisma } from '@prisma/client';

export const notificationSelect = {
  id: true,
  userId: true,
  type: true,
  title: true,
  message: true,
  isRead: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

