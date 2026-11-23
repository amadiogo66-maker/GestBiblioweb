import { NextResponse, type NextRequest } from 'next/server';
import { attendanceCheckInSchema, listAttendancesSchema } from '@/schemas/attendance';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { rejectCrossOrigin, requireActiveUser } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import type { PaginatedResponse } from '@/types';
import { BODY_LIMITS } from '@/lib/constants';
import { payloadTooLargeResponse, readJsonBody } from '@/lib/json-body';
import { getClientIp } from '@/lib/client-ip';

export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const authz = await requireActiveUser();

    if (!authz.ok) {
      return authz.response;
    }

    const { user } = authz;

    const query = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = listAttendancesSchema.safeParse(query);

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const { page, limit } = parsed.data;
    const skip = (page - 1) * limit;
    const [attendance, total] = await prisma.$transaction([
      prisma.attendance.findMany({
        where: { userId: user.id },
        orderBy: { checkIn: 'desc' },
        skip,
        take: limit,
      }),
      prisma.attendance.count({ where: { userId: user.id } }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return jsonResponse<PaginatedResponse<(typeof attendance)[number]>>({
      success: true,
      data: {
        data: attendance,
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
    logger.error('Attendance list failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de récupérer les présences' }, 500);
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

    const payload = await readJsonBody(request, BODY_LIMITS.default);
    const parsed = attendanceCheckInSchema.safeParse(payload);

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const attendance = await prisma.attendance.create({
      data: {
        userId: user.id,
        method: parsed.data.method,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: 'attendance.checkin',
        ipAddress: getClientIp(request.headers),
        userAgent: request.headers.get('user-agent'),
        details: { attendanceId: attendance.id, method: attendance.method },
      },
    });

    return jsonResponse({ success: true, message: 'Présence enregistrée', data: attendance }, 201);
  } catch (error) {
    const tooLarge = payloadTooLargeResponse(error);

    if (tooLarge) {
      return tooLarge;
    }

    logger.error('Attendance check-in failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible d’enregistrer la présence' }, 500);
  }
}
