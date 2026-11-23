import { Prisma } from '@prisma/client';
import type { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { buildActivityLogData } from '@/lib/activity-log';
import { BODY_LIMITS, READING_LIST_QUOTAS } from '@/lib/constants';
import { payloadTooLargeResponse, readJsonBodyOrNull } from '@/lib/json-body';
import { findOwnedReadingList } from '@/lib/reading-lists';
import { beginTeacherWrite, conflictResponse, notFoundResponse } from '@/lib/write-route';
import { readingListItemAddSchema } from '@/schemas/reading-list';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

class QuotaError extends Error {}

/** Ajoute un ouvrage EXISTANT du catalogue à une liste de l'enseignant (en dernière position). */
export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const begin = await beginTeacherWrite(request, 'teacher-reading-list');

  if (!begin.ok) {
    return begin.response;
  }

  try {
    const parsed = readingListItemAddSchema.safeParse(await readJsonBodyOrNull(request, BODY_LIMITS.default));

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const { id } = await context.params;
    const list = await findOwnedReadingList(id, begin.user.id);

    if (!list) {
      return notFoundResponse('Liste introuvable');
    }

    const book = await prisma.book.findUnique({ where: { id: parsed.data.bookId }, select: { id: true } });

    if (!book) {
      return notFoundResponse('Ouvrage introuvable dans le catalogue');
    }

    const item = await prisma.$transaction(async (tx) => {
      const stats = await tx.readingListItem.aggregate({ where: { listId: list.id }, _count: { _all: true }, _max: { position: true } });

      if (stats._count._all >= READING_LIST_QUOTAS.itemsPerList) {
        throw new QuotaError();
      }

      const created = await tx.readingListItem.create({
        data: { listId: list.id, bookId: book.id, note: parsed.data.note ?? null, position: (stats._max.position ?? -1) + 1 },
        select: { id: true, position: true },
      });
      await tx.readingList.update({ where: { id: list.id }, data: { updatedAt: new Date() } });
      await tx.activityLog.create({
        data: buildActivityLogData({ action: 'reading_list.item_add', userId: begin.user.id, headers: request.headers, details: { listId: list.id } }),
      });

      return created;
    });

    return jsonResponse({ success: true, message: 'Ouvrage ajouté', data: item }, 201);
  } catch (error) {
    const tooLarge = payloadTooLargeResponse(error);

    if (tooLarge) {
      return tooLarge;
    }

    if (error instanceof QuotaError) {
      return conflictResponse(`Une liste contient au plus ${READING_LIST_QUOTAS.itemsPerList} ouvrages.`);
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return conflictResponse('Cet ouvrage est déjà dans la liste.');
    }

    logger.error('Reading list item add failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible d’ajouter l’ouvrage' }, 500);
  }
}
