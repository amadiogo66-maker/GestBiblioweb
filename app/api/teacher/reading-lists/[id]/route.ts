import type { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { buildActivityLogData } from '@/lib/activity-log';
import { BODY_LIMITS } from '@/lib/constants';
import { payloadTooLargeResponse, readJsonBodyOrNull } from '@/lib/json-body';
import { findOwnedReadingList } from '@/lib/reading-lists';
import { beginTeacherWrite, notFoundResponse } from '@/lib/write-route';
import { readingListUpdateSchema } from '@/schemas/reading-list';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const NOT_FOUND = 'Liste introuvable';

/**
 * Modifie une liste de l'enseignant : champs, publication (PUBLISHED) ou
 * dépublication (DRAFT). La liste d'un autre enseignant répond 404, comme
 * une liste inexistante. Le département ne change jamais.
 */
export async function PATCH(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const begin = await beginTeacherWrite(request, 'teacher-reading-list');

  if (!begin.ok) {
    return begin.response;
  }

  try {
    const parsed = readingListUpdateSchema.safeParse(await readJsonBodyOrNull(request, BODY_LIMITS.default));

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const { id } = await context.params;
    const list = await findOwnedReadingList(id, begin.user.id);

    if (!list) {
      return notFoundResponse(NOT_FOUND);
    }

    const { programId, status, ...fields } = parsed.data;

    if (programId) {
      const program = await prisma.program.findFirst({ where: { id: programId, departmentId: list.departmentId }, select: { id: true } });

      if (!program) {
        return jsonResponse({ success: false, message: 'Programme inconnu dans ce département' }, 400);
      }
    }

    const statusChanged = status !== undefined && status !== list.status;
    const action = statusChanged ? (status === 'PUBLISHED' ? 'reading_list.publish' : 'reading_list.unpublish') : 'reading_list.update';

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.readingList.update({
        where: { id: list.id },
        data: { ...fields, ...(programId !== undefined ? { programId } : {}), ...(status ? { status } : {}) },
        select: { id: true, title: true, status: true },
      });
      await tx.activityLog.create({
        data: buildActivityLogData({ action, userId: begin.user.id, headers: request.headers, details: { listId: list.id } }),
      });

      return result;
    });

    const message = statusChanged ? (status === 'PUBLISHED' ? 'Liste publiée' : 'Liste repassée en brouillon') : 'Liste enregistrée';

    return jsonResponse({ success: true, message, data: updated });
  } catch (error) {
    const tooLarge = payloadTooLargeResponse(error);

    if (tooLarge) {
      return tooLarge;
    }

    logger.error('Reading list update failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible d’enregistrer la liste' }, 500);
  }
}

/** Supprime une liste de l'enseignant (et ses ouvrages : suppression en cascade). */
export async function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const begin = await beginTeacherWrite(request, 'teacher-reading-list');

  if (!begin.ok) {
    return begin.response;
  }

  try {
    const { id } = await context.params;
    const list = await findOwnedReadingList(id, begin.user.id);

    if (!list) {
      return notFoundResponse(NOT_FOUND);
    }

    await prisma.$transaction([
      prisma.readingList.delete({ where: { id: list.id } }),
      prisma.activityLog.create({
        data: buildActivityLogData({ action: 'reading_list.delete', userId: begin.user.id, headers: request.headers, details: { listId: list.id } }),
      }),
    ]);

    return jsonResponse({ success: true, message: 'Liste supprimée' });
  } catch (error) {
    logger.error('Reading list deletion failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de supprimer la liste' }, 500);
  }
}
