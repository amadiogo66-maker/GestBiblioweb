import { LoanStatus, ReservationStatus } from '@prisma/client';
import { NextResponse, type NextRequest } from 'next/server';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { rejectCrossOrigin, requireActiveUser } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { updateProfileSchema } from '@/schemas/user';
import { BODY_LIMITS } from '@/lib/constants';
import { payloadTooLargeResponse, readJsonBody } from '@/lib/json-body';
import { getClientIp } from '@/lib/client-ip';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  try {
    const authz = await requireActiveUser();

    if (!authz.ok) {
      return authz.response;
    }

    const { user } = authz;

    const [profile, activeLoans, pendingReservations, unreadNotifications] = await prisma.$transaction([
      prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: {
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          role: true,
          photo: true,
          libraryCard: true,
          department: true,
          qrCode: true,
        },
      }),
      prisma.loan.count({
        where: {
          userId: user.id,
          status: LoanStatus.ACTIVE,
        },
      }),
      prisma.reservation.count({
        where: {
          userId: user.id,
          status: { in: [ReservationStatus.PENDING, ReservationStatus.READY] },
        },
      }),
      prisma.notification.count({
        where: {
          userId: user.id,
          isRead: false,
        },
      }),
    ]);

    return jsonResponse({
      success: true,
      data: {
        ...profile,
        stats: {
          activeLoans,
          pendingReservations,
          unreadNotifications,
        },
      },
    });
  } catch (error) {
    logger.error('Profile fetch failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de récupérer le profil' }, 500);
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
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

    const payload = await readJsonBody(request, BODY_LIMITS.default);
    const parsed = updateProfileSchema.safeParse(payload);

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(parsed.data.firstName !== undefined ? { firstName: parsed.data.firstName } : {}),
        ...(parsed.data.lastName !== undefined ? { lastName: parsed.data.lastName } : {}),
        ...(parsed.data.photo !== undefined ? { photo: parsed.data.photo || null } : {}),
      },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        role: true,
        photo: true,
        libraryCard: true,
        department: true,
        qrCode: true,
        updatedAt: true,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: 'profile.update',
        ipAddress: getClientIp(request.headers),
        userAgent: request.headers.get('user-agent'),
        details: { userId: updatedUser.id },
      },
    });

    return jsonResponse({
      success: true,
      message: 'Profil mis à jour',
      data: updatedUser,
    });
  } catch (error) {
    const tooLarge = payloadTooLargeResponse(error);

    if (tooLarge) {
      return tooLarge;
    }

    logger.error('Profile update failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de modifier le profil' }, 500);
  }
}

