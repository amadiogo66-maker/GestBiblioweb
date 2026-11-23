import type { NextRequest, NextResponse } from 'next/server';
import { jsonResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { buildActivityLogData } from '@/lib/activity-log';
import { ACQUISITION_NOT_FOUND } from '@/lib/acquisitions';
import { beginTeacherWrite, conflictResponse, notFoundResponse } from '@/lib/write-route';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Retrait d'une proposition par son auteur, tant qu'aucune décision n'est prise
 * (SUBMITTED). Suppression conditionnée au statut : une décision concurrente
 * l'emporte (409). La proposition d'un autre répond 404.
 */
export async function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const begin = await beginTeacherWrite(request, 'acquisition-write');

  if (!begin.ok) {
    return begin.response;
  }

  try {
    const { id } = await context.params;
    const existing = await prisma.acquisitionRequest.findFirst({ where: { id, requesterId: begin.user.id }, select: { id: true, departmentId: true } });

    if (!existing) {
      return notFoundResponse(ACQUISITION_NOT_FOUND);
    }

    const removed = await prisma.$transaction(async (tx) => {
      const { count } = await tx.acquisitionRequest.deleteMany({ where: { id: existing.id, requesterId: begin.user.id, status: 'SUBMITTED' } });

      if (count === 1) {
        await tx.activityLog.create({
          data: buildActivityLogData({
            action: 'acquisition.withdraw',
            userId: begin.user.id,
            headers: request.headers,
            details: { requestId: existing.id, departmentId: existing.departmentId },
          }),
        });
      }

      return count === 1;
    });

    return removed
      ? jsonResponse({ success: true, message: 'Proposition retirée' })
      : conflictResponse('Une décision a déjà été prise : la proposition ne peut plus être retirée.');
  } catch (error) {
    logger.error('Acquisition request withdrawal failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de retirer la proposition' }, 500);
  }
}
