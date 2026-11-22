import { LoanStatus, ReservationStatus, type Prisma } from '@prisma/client';
import { RENEWAL_MAX_COUNT } from '@/lib/constants';

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
}): boolean {
  return isRenewableLoan(loan) && loan.externalId !== null && loan.renewalRequestedAt === null;
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
