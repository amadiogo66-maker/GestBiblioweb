import { z } from 'zod';
import { ReservationStatus } from '@prisma/client';

export const createReservationSchema = z.object({
  bookId: z.string().cuid(),
});

export const listReservationsSchema = z.object({
  status: z.nativeEnum(ReservationStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
