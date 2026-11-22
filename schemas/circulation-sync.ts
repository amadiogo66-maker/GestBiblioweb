import { z } from 'zod';

const MAX_INT = 2_147_483_647;

/** Date ISO 8601 : date seule (AAAA-MM-JJ) ou date-heure avec fuseau. */
const isoDate = z
  .string()
  .trim()
  .refine((value) => z.string().datetime({ offset: true }).safeParse(value).success || z.string().date().safeParse(value).success, {
    message: 'Date ISO 8601 attendue',
  })
  .transform((value) => new Date(value));

export const loansSyncSchema = z.object({
  loans: z.array(z.unknown()).min(1).max(1000),
});

export const loanSyncItemSchema = z
  .object({
    externalId: z.string().trim().min(1).max(100),
    matricule: z.string().trim().min(1).max(50),
    bookExternalId: z.string().trim().min(1).max(100),
    borrowDate: isoDate,
    dueDate: isoDate,
    returnDate: isoDate.nullable().optional(),
    status: z.enum(['ACTIVE', 'RETURNED', 'OVERDUE', 'LOST']).optional(),
    renewalCount: z.number().int().min(0).max(10).default(0),
    // Borne de la colonne Decimal(10, 2).
    fineAmount: z.number().finite().min(0).max(99_999_999.99).nullable().optional(),
    availableCopies: z.number().int().min(0).max(MAX_INT).optional(),
  })
  .superRefine((loan, context) => {
    if (loan.status === 'RETURNED' && !loan.returnDate) {
      context.addIssue({ code: 'custom', path: ['returnDate'], message: 'Statut RETURNED sans date de retour' });
    }

    if (loan.dueDate < loan.borrowDate) {
      context.addIssue({ code: 'custom', path: ['dueDate'], message: "Date d'échéance antérieure à la date d'emprunt" });
    }
  })
  .transform((loan) => ({
    ...loan,
    returnDate: loan.returnDate ?? null,
    fineAmount: loan.fineAmount ?? null,
    status: loan.status ?? (loan.returnDate ? ('RETURNED' as const) : ('ACTIVE' as const)),
  }));

export const reservationsSyncSchema = z.object({
  updates: z.array(z.unknown()).min(1).max(1000),
});

export const reservationSyncItemSchema = z.object({
  reservationId: z.string().trim().min(1).max(100),
  status: z.enum(['READY', 'FULFILLED', 'EXPIRED', 'CANCELLED']),
  expiryDate: isoDate.optional(),
});

export const eventsQuerySchema = z.object({
  after: z.coerce.number().int().min(0).max(MAX_INT).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const seq = z.number().int().min(1).max(MAX_INT);

/** Exactement une des deux formes : { upToSeq } ou { seqs }. */
export const eventsAckSchema = z.union([
  z.object({ upToSeq: seq }).strict(),
  z.object({ seqs: z.array(seq).min(1).max(1000) }).strict(),
]);
