import { addDays } from 'date-fns';
import { BookStatus, LoanStatus, ReservationStatus, type Prisma } from '@prisma/client';
import {
  RENEWAL_DURATION_DAYS,
  RENEWAL_MAX_COUNT,
  RESERVATION_EXPIRY_DAYS,
} from '@/lib/constants';

export const loanSelect = {
  id: true,
  userId: true,
  bookId: true,
  borrowDate: true,
  dueDate: true,
  returnDate: true,
  status: true,
  renewalCount: true,
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

export function createRenewedDueDate(from: Date): Date {
  const baseDate = from > new Date() ? from : new Date();

  return addDays(baseDate, RENEWAL_DURATION_DAYS);
}

export function createReservationExpiryDate(from = new Date()): Date {
  return addDays(from, RESERVATION_EXPIRY_DAYS);
}

export function isRenewableLoan(loan: { status: LoanStatus; renewalCount: number; dueDate: Date }): boolean {
  return loan.status === LoanStatus.ACTIVE && loan.renewalCount < RENEWAL_MAX_COUNT && loan.dueDate >= new Date();
}

export function getInitialReservationStatus(book: { availableCopies: number; status: BookStatus }): ReservationStatus {
  return book.status === BookStatus.AVAILABLE && book.availableCopies > 0 ? ReservationStatus.READY : ReservationStatus.PENDING;
}
