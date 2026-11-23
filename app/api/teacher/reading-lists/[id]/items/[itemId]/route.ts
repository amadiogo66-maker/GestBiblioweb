import type { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { buildActivityLogData } from '@/lib/activity-log';
import { BODY_LIMITS } from '@/lib/constants';
import { payloadTooLargeResponse, readJsonBodyOrNull } from '@/lib/json-body';
import { findOwnedReadingList, moveReadingListItem } from '@/lib/reading-lists';
import { beginTeacherWrite, conflictResponse, notFoundResponse } from '@/lib/write-route';
import { readingListItemUpdateSchema } from '@/schemas/reading-list';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string; itemId: string }>;
}

const NOT_FOUND = 'Ouvrage introuvable dans cette liste';

/** Déplacement impossible (déjà en tête ou en fin) : la transaction est annulée. */
class EdgeOfListError extends Error {}

/** Ouvrage d'une liste de l'enseignant : la liste doit lui appartenir, l'ouvrage à la liste. */
async function findOwnedItem(listId: string, itemId: string, ownerId: string) {
  const list = await findOwnedReadingList(listId, ownerId);

  if (!list) {
    return null;
  }

  const item = await prisma.readingListItem.findFirst({ where: { id: itemId, listId: list.id }, select: { id: true } });

  return item ? { list, item } : null;
}

/** Modifie la note et/ou la position (haut, bas) d'un ouvrage de la liste. */
export async function PATCH(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const begin = await beginTeacherWrite(request, 'teacher-reading-list');

  if (!begin.ok) {
    return begin.response;
  }

  try {
    const parsed = readingListItemUpdateSchema.safeParse(await readJsonBodyOrNull(request, BODY_LIMITS.default));

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const { id, itemId } = await context.params;
    const found = await findOwnedItem(id, itemId, begin.user.id);

    if (!found) {
      return notFoundResponse(NOT_FOUND);
    }

    const { note, move } = parsed.data;
    await prisma.$transaction(async (tx) => {
      if (note !== undefined) {
        await tx.readingListItem.update({ where: { id: found.item.id }, data: { note } });
      }

      if (move && !(await moveReadingListItem(tx, found.list.id, found.item.id, move))) {
        throw new EdgeOfListError();
      }

      await tx.readingList.update({ where: { id: found.list.id }, data: { updatedAt: new Date() } });
      await tx.activityLog.create({
        data: buildActivityLogData({ action: 'reading_list.item_update', userId: begin.user.id, headers: request.headers, details: { listId: found.list.id } }),
      });
    });

    return jsonResponse({ success: true, message: 'Ouvrage mis à jour' });
  } catch (error) {
    const tooLarge = payloadTooLargeResponse(error);

    if (tooLarge) {
      return tooLarge;
    }

    if (error instanceof EdgeOfListError) {
      return conflictResponse('Cet ouvrage est déjà au bout de la liste dans cette direction.');
    }

    logger.error('Reading list item update failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de modifier l’ouvrage' }, 500);
  }
}

/** Retire un ouvrage de la liste (l'ouvrage reste au catalogue). */
export async function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const begin = await beginTeacherWrite(request, 'teacher-reading-list');

  if (!begin.ok) {
    return begin.response;
  }

  try {
    const { id, itemId } = await context.params;
    const found = await findOwnedItem(id, itemId, begin.user.id);

    if (!found) {
      return notFoundResponse(NOT_FOUND);
    }

    await prisma.$transaction([
      prisma.readingListItem.delete({ where: { id: found.item.id } }),
      prisma.readingList.update({ where: { id: found.list.id }, data: { updatedAt: new Date() } }),
      prisma.activityLog.create({
        data: buildActivityLogData({ action: 'reading_list.item_remove', userId: begin.user.id, headers: request.headers, details: { listId: found.list.id } }),
      }),
    ]);

    return jsonResponse({ success: true, message: 'Ouvrage retiré de la liste' });
  } catch (error) {
    logger.error('Reading list item removal failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de retirer l’ouvrage' }, 500);
  }
}
