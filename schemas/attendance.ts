import { z } from 'zod';
import { CheckInMethod } from '@prisma/client';

export const attendanceCheckInSchema = z.object({
  method: z.nativeEnum(CheckInMethod).optional().default(CheckInMethod.QR_CODE),
});

export const attendanceCheckoutSchema = z.object({
  checkOut: z.coerce.date().optional(),
});

export const listAttendancesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
