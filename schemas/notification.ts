import { z } from 'zod';
import { NotificationType } from '@prisma/client';

/** Booléen JSON, ou chaîne "true"/"false" : "false" vaut bien false. */
const booleanLike = z.union([z.boolean(), z.enum(['true', 'false']).transform((value) => value === 'true')]);

export const listNotificationsSchema = z.object({
  type: z.nativeEnum(NotificationType).optional(),
  isRead: booleanLike.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Destinataire : userId (forme historique) OU matricule, exactement l'un des deux. */
export const notificationSyncSchema = z
  .object({
    userId: z.string().trim().min(1).optional(),
    matricule: z.string().trim().min(1).max(50).optional(),
    type: z.nativeEnum(NotificationType),
    title: z.string().trim().min(1).max(255),
    message: z.string().trim().min(1).max(2000),
    isRead: booleanLike.optional().default(false),
    dedupeKey: z.string().trim().min(1).max(200).optional(),
  })
  .refine((data) => Boolean(data.userId) !== Boolean(data.matricule), {
    message: 'Indiquer userId ou matricule, pas les deux',
    path: ['userId'],
  });

export const notificationsBatchSchema = z.object({
  notifications: z.array(z.unknown()).min(1).max(1000),
});

