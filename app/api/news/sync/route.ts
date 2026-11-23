import { NextResponse, type NextRequest } from 'next/server';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { rejectInvalidApiKey } from '@/lib/api-key';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { NewsCategory } from '@prisma/client';
import { BODY_LIMITS } from '@/lib/constants';
import { payloadTooLargeResponse, readJsonBody } from '@/lib/json-body';
import { getClientIp } from '@/lib/client-ip';

export const runtime = 'nodejs';

const newsSyncSchema = z.object({
  action: z.enum(['CREATE', 'UPDATE', 'DELETE']),
  news: z.object({
    id: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    content: z.string().trim().min(1).max(4000).optional(),
    image: z.string().url().optional().or(z.literal('')).optional(),
    category: z.nativeEnum(NewsCategory).optional(),
    publishedAt: z.coerce.date().optional(),
    isPublished: z.boolean().optional(),
  }),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rejectedKey = rejectInvalidApiKey(request, 'Gest Biblio news sync API key is not configured');

  if (rejectedKey) {
    return rejectedKey;
  }

  try {
    const payload = await readJsonBody(request, BODY_LIMITS.sync);
    const parsed = newsSyncSchema.safeParse(payload);

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const { action, news } = parsed.data;

    if (action === 'DELETE') {
      if (!news.id) {
        return jsonResponse({ success: false, message: 'Identifiant de l’actualité requis' }, 400);
      }

      await prisma.news.delete({ where: { id: news.id } });
      await prisma.activityLog.create({
        data: {
          action: 'news.sync.delete',
          ipAddress: getClientIp(request.headers),
          userAgent: request.headers.get('user-agent'),
          details: { newsId: news.id },
        },
      });

      return jsonResponse({ success: true, message: 'Actualité supprimée' });
    }

    const data = {
      title: news.title ?? '',
      content: news.content ?? '',
      image: news.image || null,
      category: news.category ?? NewsCategory.GENERAL,
      publishedAt: news.publishedAt ?? new Date(),
      isPublished: news.isPublished ?? true,
    };

    let syncedNews;

    if (action === 'CREATE') {
      syncedNews = news.id
        ? await prisma.news.upsert({
            where: { id: news.id },
            create: { id: news.id, ...data },
            update: data,
          })
        : await prisma.news.create({ data });
    } else {
      if (!news.id) {
        return jsonResponse({ success: false, message: 'Identifiant de l’actualité requis' }, 400);
      }

      syncedNews = await prisma.news.update({
        where: { id: news.id },
        data,
      });
    }

    await prisma.activityLog.create({
      data: {
        action: action === 'CREATE' ? 'news.sync.create' : 'news.sync.update',
        ipAddress: getClientIp(request.headers),
        userAgent: request.headers.get('user-agent'),
        details: { newsId: syncedNews.id },
      },
    });

    return jsonResponse({ success: true, message: 'Actualité synchronisée', data: syncedNews });
  } catch (error) {
    const tooLarge = payloadTooLargeResponse(error);

    if (tooLarge) {
      return tooLarge;
    }

    logger.error('News sync failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de synchroniser l’actualité' }, 500);
  }
}
