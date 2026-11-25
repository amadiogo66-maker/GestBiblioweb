import type { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { buildActivityLogData } from '@/lib/activity-log';
import { BODY_LIMITS } from '@/lib/constants';
import { payloadTooLargeResponse, readJsonBodyOrNull } from '@/lib/json-body';
import { AcquisitionConflictError, applyAcquisitionDecision, evaluateAcquisitionDecision, ACQUISITION_NOT_FOUND } from '@/lib/acquisitions';
import { beginStaffDepartmentWrite, conflictResponse, notFoundResponse } from '@/lib/write-route';
import { acquisitionDecisionSchema } from '@/schemas/acquisition';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const SUCCESS_MESSAGES = {
  approve: 'Proposition validée et transmise à la bibliothèque',
  reject: 'Proposition refusée',
  accept: 'Proposition acceptée',
  refuse: 'Proposition refusée',
  acquired: 'Ouvrage marqué comme acquis',
} as const;

/**
 * Décision sur une proposition. Le département de la proposition est lu en base
 * puis contrôlé par canAccessDepartment (dans evaluateAcquisitionDecision) :
 * une proposition d'un autre département répond 404, comme une inexistante.
 */
export async function PATCH(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const begin = await beginStaffDepartmentWrite(request);

  if (!begin.ok) {
    return begin.response;
  }

  try {
    const parsed = acquisitionDecisionSchema.safeParse(await readJsonBodyOrNull(request, BODY_LIMITS.default));

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const { id } = await context.params;
    const existing = await prisma.acquisitionRequest.findUnique({
      where: { id },
      select: { id: true, requesterId: true, title: true, departmentId: true, status: true },
    });

    if (!existing) {
      return notFoundResponse(ACQUISITION_NOT_FOUND);
    }

    const decision = evaluateAcquisitionDecision(begin.actor, existing, parsed.data.action);

    if (!decision.allowed) {
      if (decision.selfDecision) {
        // Action dédiée ; détails réduits à la proposition et à l'action tentée.
        await prisma.activityLog.create({
          data: buildActivityLogData({
            action: 'acquisition.self_decision_denied',
            userId: begin.user.id,
            headers: request.headers,
            details: { requestId: existing.id, attempted: parsed.data.action },
          }),
        });
      }

      return jsonResponse({ success: false, message: decision.message }, decision.httpStatus);
    }

    await prisma.$transaction((tx) =>
      applyAcquisitionDecision(tx, {
        request: existing,
        decision,
        actorId: begin.user.id,
        note: parsed.data.note?.trim() || null,
        headers: request.headers,
      })
    );

    return jsonResponse({ success: true, message: SUCCESS_MESSAGES[parsed.data.action], data: { status: decision.to } });
  } catch (error) {
    const tooLarge = payloadTooLargeResponse(error);

    if (tooLarge) {
      return tooLarge;
    }

    if (error instanceof AcquisitionConflictError) {
      return conflictResponse('Cette proposition vient d’être traitée par quelqu’un d’autre.');
    }

    logger.error('Acquisition decision failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible d’enregistrer la décision' }, 500);
  }
}
