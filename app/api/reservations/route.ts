import { BookStatus, LoanStatus, ReservationStatus } from '@prisma/client';
import { NextResponse, type NextRequest } from 'next/server';
import { createReservationSchema, listReservationsSchema } from '@/schemas/reservation';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { rejectCrossOrigin, requireActiveUser } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { createReservationExpiryDate, getInitialReservationStatus, reservationSelect } from '@/lib/circulation';
import type { PaginatedResponse } from '@/types';

export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const authz = await requireActiveUser();

    if (!authz.ok) {
      return authz.response;
    }

    const { user } = authz;

    const query = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = listReservationsSchema.safeParse(query);

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const { page, limit, status } = parsed.data;
    const where = {
      userId: user.id,
      ...(status ? { status } : {}),
    };
    const skip = (page - 1) * limit;
    const [reservations, total] = await prisma.$transaction([
      prisma.reservation.findMany({
        where,
        select: reservationSelect,
        orderBy: { requestDate: 'desc' },
        skip,
        take: limit,
      }),
      prisma.reservation.count({ where }),
    ]);
    const totalPages = Math.ceil(total / limit);

    return jsonResponse<PaginatedResponse<(typeof reservations)[number]>>({
      success: true,
      data: {
        data: reservations,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
    });
  } catch (error) {
    logger.error('Reservation list failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de récupérer les réservations' }, 500);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
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

    const payload = await request.json();
    const parsed = createReservationSchema.safeParse(payload);

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const reservation = await prisma.$transaction(async (tx) => {
      const activeLoan = await tx.loan.findFirst({
        where: {
          userId: user.id,
          bookId: parsed.data.bookId,
          status: LoanStatus.ACTIVE,
        },
        select: { id: true },
      });

      if (activeLoan) {
        throw new Error('BOOK_ALREADY_BORROWED');
      }

      const activeReservation = await tx.reservation.findFirst({
        where: {
          userId: user.id,
          bookId: parsed.data.bookId,
          status: { in: [ReservationStatus.PENDING, ReservationStatus.READY] },
        },
        select: { id: true },
      });

      if (activeReservation) {
        throw new Error('RESERVATION_ALREADY_EXISTS');
      }

      const book = await tx.book.findUnique({
        where: { id: parsed.data.bookId },
        select: {
          id: true,
          status: true,
          availableCopies: true,
        },
      });

      if (!book) {
        throw new Error('BOOK_NOT_FOUND');
      }

      if (book.status === BookStatus.LOST || book.status === BookStatus.UNDER_MAINTENANCE) {
        throw new Error('BOOK_NOT_RESERVABLE');
      }

      const initialStatus = getInitialReservationStatus(book);
      const createdReservation = await tx.reservation.create({
        data: {
          userId: user.id,
          bookId: book.id,
          status: initialStatus,
          expiryDate: initialStatus === ReservationStatus.READY ? createReservationExpiryDate() : null,
        },
        select: reservationSelect,
      });

      await tx.activityLog.create({
        data: {
          userId: user.id,
          action: 'reservation.create',
          ipAddress: request.headers.get('x-forwarded-for'),
          userAgent: request.headers.get('user-agent'),
          details: { reservationId: createdReservation.id, bookId: book.id, status: initialStatus },
        },
      });

      return createdReservation;
    });

    return jsonResponse({ success: true, message: 'Réservation créée', data: reservation }, 201);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'BOOK_ALREADY_BORROWED') {
        return jsonResponse({ success: false, message: 'Vous avez déjà un emprunt actif pour ce livre' }, 409);
      }

      if (error.message === 'RESERVATION_ALREADY_EXISTS') {
        return jsonResponse({ success: false, message: 'Vous avez déjà une réservation active pour ce livre' }, 409);
      }

      if (error.message === 'BOOK_NOT_FOUND') {
        return jsonResponse({ success: false, message: 'Livre introuvable' }, 404);
      }

      if (error.message === 'BOOK_NOT_RESERVABLE') {
        return jsonResponse({ success: false, message: 'Ce livre ne peut pas être réservé' }, 409);
      }
    }

    logger.error('Reservation creation failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de créer la réservation' }, 500);
  }
}

