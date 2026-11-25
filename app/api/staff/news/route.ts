import type { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { buildActivityLogData } from '@/lib/activity-log';
import { BODY_LIMITS } from '@/lib/constants';
import { payloadTooLargeResponse, readJsonBodyOrNull } from '@/lib/json-body';
import { nextPublishedAt } from '@/lib/staff-news';
import { beginStaffNewsWrite } from '@/lib/write-route';
import { staffNewsCreateSchema } from '@/schemas/news';

export const runtime = 'nodejs';

/**
 * Création d'une actualité du site (origine SITE), en brouillon ou publiée.
 * Journal dans la même transaction : identifiant et champs, jamais titre ni contenu.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const begin = await beginStaffNewsWrite(request);

  if (!begin.ok) {
    return begin.response;
  }

  try {
    const parsed = staffNewsCreateSchema.safeParse(await readJsonBodyOrNull(request, BODY_LIMITS.default));

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const { title, content, category, isPublished } = parsed.data;
    const created = await prisma.$transaction(async (tx) => {
      const news = await tx.news.create({
        data: { title, content, category, isPublished, publishedAt: nextPublishedAt(null, isPublished), source: 'SITE', createdById: begin.user.id },
        select: { id: true, isPublished: true, publishedAt: true },
      });
      const fields = ['title', 'content', 'category', 'isPublished'].join(',');
      await tx.activityLog.create({
        data: buildActivityLogData({ action: 'news.site.create', userId: begin.user.id, headers: request.headers, details: { newsId: news.id, fields } }),
      });
      if (isPublished) {
        await tx.activityLog.create({
          data: buildActivityLogData({ action: 'news.site.publish', userId: begin.user.id, headers: request.headers, details: { newsId: news.id } }),
        });
      }

      return news;
    });

    return jsonResponse({ success: true, message: isPublished ? 'Actualité publiée' : 'Brouillon enregistré', data: created }, 201);
  } catch (error) {
    const tooLarge = payloadTooLargeResponse(error);

    if (tooLarge) {
      return tooLarge;
    }

    logger.error('Staff news creation failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible d’enregistrer l’actualité' }, 500);
  }
}
