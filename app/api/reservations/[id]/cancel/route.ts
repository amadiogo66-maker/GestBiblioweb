import { ReservationStatus } from '@prisma/client';
import { NextResponse, type NextRequest } from 'next/server';
import { jsonResponse } from '@/lib/api';
import { rejectCrossOrigin, requireActiveUser } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { reservationSelect } from '@/lib/circulation';

export const runtime = 'nodejs';

interface CancelReservationRouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function PATCH(request: NextRequest, context: CancelReservationRouteContext): Promise<NextResponse> {
  const crossOrigin = rejectCrossOrigin(request);

  if (crossOrigin) {
    return crossOrigin;
  }

  try {
    const authz = await requireActiveUser();

    if (!authz.ok) {
      return authz.response;
    }

    const { user } = authz;

    const { id } = await context.params;
    const reservation = await prisma.reservation.findFirst({
      where: {
        id,
        userId: user.id,
        status: { in: [ReservationStatus.PENDING, ReservationStatus.READY] },
      },
      select: { id: true },
    });

    if (!reservation) {
      return jsonResponse({ success: false, message: 'Réservation introuvable' }, 404);
    }

    const cancelledReservation = await prisma.reservation.update({
      where: { id: reservation.id },
      data: { status: ReservationStatus.CANCELLED },
      select: reservationSelect,
    });

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: 'reservation.cancel',
        ipAddress: request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent'),
        details: { reservationId: cancelledReservation.id, bookId: cancelledReservation.bookId },
      },
    });

    return jsonResponse({ success: true, message: 'Réservation annulée', data: cancelledReservation });
  } catch (error) {
    logger.error('Reservation cancellation failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible d’annuler la réservation' }, 500);
  }
}

