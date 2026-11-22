import { LoanStatus, ReservationStatus, type Prisma } from '@prisma/client';
import { RENEWAL_MAX_COUNT } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

export const loanSelect = {
  id: true,
  externalId: true,
  userId: true,
  bookId: true,
  borrowDate: true,
  dueDate: true,
  returnDate: true,
  status: true,
  renewalCount: true,
  renewalRequestedAt: true,
  renewalRefusedAt: true,
  fineAmount: true,
  book: {
    select: {
      id: true,
      externalId: true,
      title: true,
      author: true,
      isbn: true,
      coverImage: true,
      department: true,
      category: true,
      location: true,
    },
  },
} satisfies Prisma.LoanSelect;

export const reservationSelect = {
  id: true,
  userId: true,
  bookId: true,
  requestDate: true,
  expiryDate: true,
  status: true,
  notifiedAt: true,
  book: {
    select: {
      id: true,
      externalId: true,
      title: true,
      author: true,
      isbn: true,
      coverImage: true,
      department: true,
      category: true,
      location: true,
      availableCopies: true,
      status: true,
    },
  },
} satisfies Prisma.ReservationSelect;

export type LoanWithBook = Prisma.LoanGetPayload<{ select: typeof loanSelect }>;
export type ReservationWithBook = Prisma.ReservationGetPayload<{ select: typeof reservationSelect }>;

export function isRenewableLoan(loan: { status: LoanStatus; renewalCount: number; dueDate: Date }): boolean {
  return loan.status === LoanStatus.ACTIVE && loan.renewalCount < RENEWAL_MAX_COUNT && loan.dueDate >= new Date();
}

/** Une demande de renouvellement n'a de sens que pour un prêt connu du logiciel de gestion. */
export function canRequestRenewal(loan: {
  status: LoanStatus;
  renewalCount: number;
  dueDate: Date;
  externalId: string | null;
  renewalRequestedAt: Date | null;
  renewalRefusedAt: Date | null;
}): boolean {
  return isRenewableLoan(loan) && loan.externalId !== null && loan.renewalRequestedAt === null && loan.renewalRefusedAt === null;
}

interface RenewalExisting {
  dueDate: Date;
  renewalCount: number;
  renewalRequestedAt: Date | null;
  renewalRefusedAt: Date | null;
}

interface RenewalIncoming {
  dueDate: Date;
  renewalCount: number;
  status: LoanStatus;
  renewalDecision?: 'REFUSED';
}

export interface RenewalState {
  renewalRequestedAt: Date | null;
  renewalRefusedAt: Date | null;
  /** Décision à notifier au lecteur, seulement si une demande était en attente. */
  outcome: 'granted' | 'refused' | null;
  /** Refus reçu avec une échéance ou un compteur différents : incohérent. */
  conflict: boolean;
}

/** État du renouvellement après un élément de /api/loans/sync (fonction pure). */
export function resolveRenewalState(existing: RenewalExisting | null, incoming: RenewalIncoming, now = new Date()): RenewalState {
  const dueChanged = existing !== null && existing.dueDate.getTime() !== incoming.dueDate.getTime();
  const countChanged = existing !== null && existing.renewalCount !== incoming.renewalCount;
  const wasRequested = Boolean(existing?.renewalRequestedAt);
  const isActive = incoming.status === LoanStatus.ACTIVE;

  if (incoming.renewalDecision === 'REFUSED') {
    if (dueChanged || countChanged) {
      return {
        renewalRequestedAt: existing?.renewalRequestedAt ?? null,
        renewalRefusedAt: existing?.renewalRefusedAt ?? null,
        outcome: null,
        conflict: true,
      };
    }

    return {
      renewalRequestedAt: null,
      // Rejeu : la date du premier refus est conservée.
      renewalRefusedAt: isActive ? existing?.renewalRefusedAt ?? now : null,
      outcome: wasRequested && isActive ? 'refused' : null,
      conflict: false,
    };
  }

  const stillInProgress = isActive || incoming.status === LoanStatus.OVERDUE;

  return {
    renewalRequestedAt: dueChanged || countChanged ? null : existing?.renewalRequestedAt ?? null,
    renewalRefusedAt: dueChanged || !isActive ? null : existing?.renewalRefusedAt ?? null,
    outcome: wasRequested && (dueChanged || countChanged) && stillInProgress ? 'granted' : null,
    conflict: false,
  };
}

/**
 * Rattachement tardif : relie à ce compte les prêts de son matricule reçus sans
 * compte. Une requête indexée, idempotente, sans effet pour un compte sans matricule.
 */
export async function attachOrphanLoans(userId: string): Promise<void> {
  try {
    await prisma.$executeRaw`
      UPDATE "Loan" SET "userId" = ${userId}
      WHERE "userId" IS NULL
        AND "matricule" = (SELECT "matricule" FROM "User" WHERE "id" = ${userId})
    `;
  } catch (error) {
    logger.error('Orphan loan attachment failed', { error: error instanceof Error ? error.message : 'unknown error' });
  }
}

const RESERVATION_TRANSITIONS: Partial<Record<ReservationStatus, readonly ReservationStatus[]>> = {
  PENDING: ['READY', 'FULFILLED', 'EXPIRED', 'CANCELLED'],
  READY: ['FULFILLED', 'EXPIRED', 'CANCELLED'],
};

/** Transition demandée par le logiciel : même statut = sans effet ; état terminal = figé. */
export function evaluateReservationTransition(
  current: ReservationStatus,
  next: ReservationStatus
): 'apply' | 'unchanged' | 'forbidden' {
  if (current === next) {
    return 'unchanged';
  }

  return RESERVATION_TRANSITIONS[current]?.includes(next) ? 'apply' : 'forbidden';
}
