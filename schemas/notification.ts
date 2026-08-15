import { z } from 'zod';
import { NotificationType } from '@prisma/client';

export const listNotificationsSchema = z.object({
  type: z.nativeEnum(NotificationType).optional(),
  isRead: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const notificationSyncSchema = z.object({
  userId: z.string().trim().min(1),
  type: z.nativeEnum(NotificationType),
  title: z.string().trim().min(1).max(255),
  message: z.string().trim().min(1).max(2000),
  isRead: z.boolean().optional().default(false),
});

