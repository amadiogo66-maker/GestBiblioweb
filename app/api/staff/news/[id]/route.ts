import type { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { buildActivityLogData } from '@/lib/activity-log';
import { BODY_LIMITS } from '@/lib/constants';
import { payloadTooLargeResponse, readJsonBodyOrNull } from '@/lib/json-body';
import { NEWS_NOT_FOUND, changedNewsFields, evaluateNewsWrite, nextPublishedAt } from '@/lib/staff-news';
import { beginStaffNewsWrite, notFoundResponse } from '@/lib/write-route';
import { staffNewsUpdateSchema } from '@/schemas/news';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const currentSelect = { id: true, source: true, title: true, content: true, category: true, isPublished: true, publishedAt: true } as const;

/**
 * Modification, publication ou dépublication d'une actualité du site.
 * Une actualité d'origine SOFTWARE est en lecture seule (403). Une action de
 * journal par opération, dans la même transaction.
 */
export async function PATCH(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const begin = await beginStaffNewsWrite(request);

  if (!begin.ok) {
    return begin.response;
  }

  try {
    const parsed = staffNewsUpdateSchema.safeParse(await readJsonBodyOrNull(request, BODY_LIMITS.default));

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const { id } = await context.params;
    const current = await prisma.news.findUnique({ where: { id }, select: currentSelect });

    if (!current) {
      return notFoundResponse(NEWS_NOT_FOUND);
    }

    const decision = evaluateNewsWrite(begin.staffRoles, current.source, 'update');

    if (!decision.allowed) {
      return jsonResponse({ success: false, message: decision.message }, decision.httpStatus);
    }

    const changed = changedNewsFields(current, parsed.data);
    const contentFields = changed.filter((field) => field !== 'isPublished');
    const statusChanged = changed.includes('isPublished');
    const isPublished = parsed.data.isPublished ?? current.isPublished;

    const updated = await prisma.$transaction(async (tx) => {
      const news = await tx.news.update({
        // Condition sur l'origine : une actualité ne peut pas devenir SOFTWARE entre-temps, mais on reste strict.
        where: { id: current.id, source: 'SITE' },
        data: {
          ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
          ...(parsed.data.content !== undefined ? { content: parsed.data.content } : {}),
          ...(parsed.data.category !== undefined ? { category: parsed.data.category } : {}),
          isPublished,
          publishedAt: nextPublishedAt(current.publishedAt, isPublished),
        },
        select: { id: true, isPublished: true, publishedAt: true },
      });
      const entry = (action: string, details: Record<string, string>) =>
        tx.activityLog.create({ data: buildActivityLogData({ action, userId: begin.user.id, headers: request.headers, details: { newsId: news.id, ...details } }) });

      if (contentFields.length > 0) await entry('news.site.update', { fields: contentFields.join(',') });
      if (statusChanged) await entry(isPublished ? 'news.site.publish' : 'news.site.unpublish', {});

      return news;
    });

    const message = statusChanged ? (isPublished ? 'Actualité publiée' : 'Actualité dépubliée') : changed.length > 0 ? 'Actualité enregistrée' : 'Aucune modification';

    return jsonResponse({ success: true, message, data: updated });
  } catch (error) {
    const tooLarge = payloadTooLargeResponse(error);

    if (tooLarge) {
      return tooLarge;
    }

    logger.error('Staff news update failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible d’enregistrer l’actualité' }, 500);
  }
}

/** Suppression : ADMIN seulement, actualité du site seulement. */
export async function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const begin = await beginStaffNewsWrite(request);

  if (!begin.ok) {
    return begin.response;
  }

  try {
    const { id } = await context.params;
    const current = await prisma.news.findUnique({ where: { id }, select: { id: true, source: true } });

    if (!current) {
      return notFoundResponse(NEWS_NOT_FOUND);
    }

    const decision = evaluateNewsWrite(begin.staffRoles, current.source, 'delete');

    if (!decision.allowed) {
      return jsonResponse({ success: false, message: decision.message }, decision.httpStatus);
    }

    await prisma.$transaction([
      prisma.news.delete({ where: { id: current.id, source: 'SITE' } }),
      prisma.activityLog.create({
        data: buildActivityLogData({ action: 'news.site.delete', userId: begin.user.id, headers: request.headers, details: { newsId: current.id } }),
      }),
    ]);

    return jsonResponse({ success: true, message: 'Actualité supprimée' });
  } catch (error) {
    logger.error('Staff news deletion failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de supprimer l’actualité' }, 500);
  }
}
