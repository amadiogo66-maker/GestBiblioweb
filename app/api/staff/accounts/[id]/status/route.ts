import type { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { rejectCrossOrigin, requireStaff } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { enforceRateLimits, rateLimitKey } from '@/lib/rate-limit';
import { buildActivityLogData } from '@/lib/activity-log';
import { evaluateModeration } from '@/lib/staff-moderation';
import { ACCOUNT_STATUS_LABELS } from '@/lib/staff-labels';
import { RATE_LIMITS } from '@/lib/constants';
import { moderationSchema } from '@/schemas/staff';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

class StatusChangedError extends Error {}

/**
 * Modération d'un compte par le personnel (suspendre, bannir, réactiver).
 * Ordre des contrôles : Origin (anti-CSRF) → personnel actif relu en base et
 * double authentification vérifiée → limitation par acteur → corps → règles →
 * transaction (statut + journal).
 */
export async function PATCH(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const crossOrigin = rejectCrossOrigin(request);

  if (crossOrigin) {
    return crossOrigin;
  }

  const staff = await requireStaff();

  if (!staff.ok) {
    return staff.response;
  }

  const limited = await enforceRateLimits([
    { key: rateLimitKey('staff-moderation', staff.user.id), rule: RATE_LIMITS.staffModeration },
  ]);

  if (limited) {
    return limited;
  }

  try {
    const parsed = moderationSchema.safeParse(await request.json().catch(() => null));

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const { id } = await context.params;
    const target = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        libraryMember: { select: { inscriptionActive: true, dateExpiration: true } },
        staffAssignments: { where: { revokedAt: null }, select: { id: true }, take: 1 },
      },
    });

    if (!target) {
      return jsonResponse({ success: false, message: 'Compte introuvable' }, 404);
    }

    const { action, reason } = parsed.data;
    const decision = evaluateModeration(
      { id: staff.user.id, roles: staff.staffRoles },
      { id: target.id, status: target.status, hasActiveStaffRole: target.staffAssignments.length > 0, member: target.libraryMember },
      action
    );

    if (!decision.allowed) {
      return jsonResponse({ success: false, message: decision.message }, decision.httpStatus);
    }

    await prisma.$transaction(async (tx) => {
      // Mise à jour conditionnelle : si le statut a changé entre-temps, rien n'est écrit.
      const { count } = await tx.user.updateMany({
        where: { id: target.id, status: target.status },
        data: { status: decision.nextStatus, autoSuspendedAt: null },
      });

      if (count !== 1) {
        throw new StatusChangedError();
      }

      await tx.activityLog.create({
        data: buildActivityLogData({
          action: `staff.account.${action}`,
          userId: staff.user.id,
          headers: request.headers,
          details: { targetUserId: target.id, statusBefore: target.status, statusAfter: decision.nextStatus, reason },
        }),
      });
    });

    return jsonResponse({
      success: true,
      message: `Compte ${ACCOUNT_STATUS_LABELS[decision.nextStatus].toLowerCase()}.`,
      data: { id: target.id, status: decision.nextStatus },
    });
  } catch (error) {
    if (error instanceof StatusChangedError) {
      return jsonResponse({ success: false, message: 'Le statut de ce compte vient de changer. Rechargez la page.' }, 409);
    }

    logger.error('Staff moderation failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de modifier le statut du compte' }, 500);
  }
}
