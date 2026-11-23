import type { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { buildActivityLogData } from '@/lib/activity-log';
import { BODY_LIMITS } from '@/lib/constants';
import { canAccessDepartment, isLibraryStaff } from '@/lib/department-access';
import { createNotification } from '@/lib/notifications';
import { payloadTooLargeResponse, readJsonBodyOrNull } from '@/lib/json-body';
import { beginStaffDepartmentWrite, conflictResponse, notFoundResponse } from '@/lib/write-route';
import { readingListUnpublishSchema } from '@/schemas/reading-list';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Modération : un ADMIN ou LIBRARIAN repasse une liste publiée en brouillon,
 * avec un motif journalisé. L'enseignant est prévenu (sans le motif).
 */
export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const begin = await beginStaffDepartmentWrite(request);

  if (!begin.ok) {
    return begin.response;
  }

  if (!isLibraryStaff(begin.actor.roles)) {
    return jsonResponse({ success: false, message: 'Modération réservée à la bibliothèque' }, 403);
  }

  try {
    const parsed = readingListUnpublishSchema.safeParse(await readJsonBodyOrNull(request, BODY_LIMITS.default));

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const { id } = await context.params;
    const list = await prisma.readingList.findUnique({ where: { id }, select: { id: true, title: true, ownerId: true, departmentId: true } });

    if (!list || !canAccessDepartment(begin.actor, list.departmentId)) {
      return notFoundResponse('Liste introuvable');
    }

    const done = await prisma.$transaction(async (tx) => {
      const { count } = await tx.readingList.updateMany({ where: { id: list.id, status: 'PUBLISHED' }, data: { status: 'DRAFT' } });

      if (count !== 1) {
        return false;
      }

      await tx.activityLog.create({
        data: buildActivityLogData({
          action: 'reading_list.moderation_unpublish',
          userId: begin.user.id,
          headers: request.headers,
          details: { listId: list.id, departmentId: list.departmentId, reason: parsed.data.reason },
        }),
      });
      await createNotification(tx, {
        userId: list.ownerId,
        type: 'GENERAL',
        title: 'Liste de lectures retirée',
        message: `Votre liste "${list.title}" a été retirée de la publication par la bibliothèque. Rapprochez-vous d'elle pour en savoir plus.`,
        dedupeKey: `reading-list:${list.id}:unpublished:${Date.now()}`,
        source: 'site',
      });

      return true;
    });

    return done ? jsonResponse({ success: true, message: 'Liste dépubliée' }) : conflictResponse('Cette liste n’est pas publiée.');
  } catch (error) {
    const tooLarge = payloadTooLargeResponse(error);

    if (tooLarge) {
      return tooLarge;
    }

    logger.error('Reading list moderation failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de dépublier la liste' }, 500);
  }
}
