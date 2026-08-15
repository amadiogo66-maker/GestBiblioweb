import { LoanStatus, ReservationStatus, UserStatus } from '@prisma/client';
import { NextResponse, type NextRequest } from 'next/server';
import { getAuthenticatedUser, jsonResponse, validationErrorResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { updateProfileSchema } from '@/schemas/user';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  try {
    const user = await getAuthenticatedUser();

    if (!user || user.status !== UserStatus.ACTIVE) {
      return jsonResponse({ success: false, message: 'Non authentifié' }, 401);
    }

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
  try {
    const user = await getAuthenticatedUser();

    if (!user || user.status !== UserStatus.ACTIVE) {
      return jsonResponse({ success: false, message: 'Non authentifié' }, 401);
    }

    const payload = await request.json();
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
        ...(parsed.data.department !== undefined ? { department: parsed.data.department || null } : {}),
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
        ipAddress: request.headers.get('x-forwarded-for'),
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
    logger.error('Profile update failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de modifier le profil' }, 500);
  }
}

