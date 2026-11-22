import { ReservationStatus } from '@prisma/client';
import { NextResponse, type NextRequest } from 'next/server';
import { jsonResponse } from '@/lib/api';
import { rejectCrossOrigin, requireActiveUser } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { reservationSelect } from '@/lib/circulation';
import { recordSiteEvent } from '@/lib/site-events';

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
    // Tout ou rien : statut, journal et événement. La mise à jour conditionnelle
    // évite d'annuler une réservation que le logiciel vient de faire évoluer.
    const cancelledReservation = await prisma.$transaction(async (tx) => {
      const { count } = await tx.reservation.updateMany({
        where: {
          id,
          userId: user.id,
          status: { in: [ReservationStatus.PENDING, ReservationStatus.READY] },
        },
        data: { status: ReservationStatus.CANCELLED },
      });

      if (count !== 1) {
        return null;
      }

      const cancelled = await tx.reservation.findUniqueOrThrow({ where: { id }, select: reservationSelect });

      await tx.activityLog.create({
        data: {
          userId: user.id,
          action: 'reservation.cancel',
          ipAddress: request.headers.get('x-forwarded-for'),
          userAgent: request.headers.get('user-agent'),
          details: { reservationId: cancelled.id, bookId: cancelled.bookId },
        },
      });

      await recordSiteEvent(tx, 'reservation.cancelled', {
        reservationId: cancelled.id,
        matricule: user.matricule,
        bookExternalId: cancelled.book.externalId,
        cancelledAt: new Date().toISOString(),
      });

      return cancelled;
    });

    if (!cancelledReservation) {
      return jsonResponse({ success: false, message: 'Réservation introuvable' }, 404);
    }

    return jsonResponse({ success: true, message: 'Réservation annulée', data: cancelledReservation });
  } catch (error) {
    logger.error('Reservation cancellation failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible d’annuler la réservation' }, 500);
  }
}

