import { LoanStatus, ReservationStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { loanSelect, reservationSelect, type LoanWithBook, type ReservationWithBook } from '@/lib/circulation';

export interface DashboardOverview {
  stats: {
    activeLoans: number;
    pendingReservations: number;
    unreadNotifications: number;
  };
  recentLoans: LoanWithBook[];
  recentReservations: ReservationWithBook[];
}

export async function getDashboardOverview(userId: string): Promise<DashboardOverview> {
  const [activeLoans, pendingReservations, unreadNotifications, recentLoans, recentReservations] =
    await prisma.$transaction([
      prisma.loan.count({ where: { userId, status: LoanStatus.ACTIVE } }),
      prisma.reservation.count({
        where: { userId, status: { in: [ReservationStatus.PENDING, ReservationStatus.READY] } },
      }),
      prisma.notification.count({ where: { userId, isRead: false } }),
      prisma.loan.findMany({
        where: { userId, status: LoanStatus.ACTIVE },
        select: loanSelect,
        orderBy: { dueDate: 'asc' },
        take: 3,
      }),
      prisma.reservation.findMany({
        where: { userId, status: { in: [ReservationStatus.PENDING, ReservationStatus.READY] } },
        select: reservationSelect,
        orderBy: { requestDate: 'desc' },
        take: 3,
      }),
    ]);

  return {
    stats: { activeLoans, pendingReservations, unreadNotifications },
    recentLoans,
    recentReservations,
  };
}
