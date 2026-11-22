import { NextResponse, type NextRequest } from 'next/server';
import { attendanceCheckoutSchema } from '@/schemas/attendance';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { rejectCrossOrigin, requireActiveUser } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

interface AttendanceRouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, context: AttendanceRouteContext): Promise<NextResponse> {
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
    const parsed = attendanceCheckoutSchema.safeParse(payload);

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const { id } = await context.params;
    const attendance = await prisma.attendance.findFirst({
      where: {
        id,
        userId: user.id,
      },
      select: { id: true, checkOut: true },
    });

    if (!attendance) {
      return jsonResponse({ success: false, message: 'Présence introuvable' }, 404);
    }

    if (attendance.checkOut) {
      return jsonResponse({ success: false, message: 'La présence est déjà clôturée' }, 409);
    }

    const updatedAttendance = await prisma.attendance.update({
      where: { id: attendance.id },
      data: { checkOut: parsed.data.checkOut ?? new Date() },
    });

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: 'attendance.checkout',
        ipAddress: request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent'),
        details: { attendanceId: updatedAttendance.id },
      },
    });

    return jsonResponse({ success: true, message: 'Présence clôturée', data: updatedAttendance });
  } catch (error) {
    logger.error('Attendance check-out failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de clôturer la présence' }, 500);
  }
}
