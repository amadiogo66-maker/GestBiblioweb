import { z } from 'zod';
import { LoanStatus } from '@prisma/client';

export const renewLoanSchema = z.object({
  loanId: z.string().cuid(),
});

export const listLoansSchema = z.object({
  status: z.nativeEnum(LoanStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
