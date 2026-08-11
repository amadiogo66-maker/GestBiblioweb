import { z } from 'zod';
import { NotificationType } from '@prisma/client';

export const listNotificationsSchema = z.object({
  type: z.nativeEnum(NotificationType).optional(),
  isRead: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

