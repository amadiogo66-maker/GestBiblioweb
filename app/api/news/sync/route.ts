import { NextResponse, type NextRequest } from 'next/server';
import { Prisma, NewsCategory } from '@prisma/client';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { rejectInvalidApiKey } from '@/lib/api-key';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { BODY_LIMITS } from '@/lib/constants';
import { payloadTooLargeResponse, readJsonBody } from '@/lib/json-body';
import { getClientIp } from '@/lib/client-ip';
import { PUBLIC_NEWS_SELECT } from '@/lib/news-data';
import { newsSyncSchema } from '@/schemas/news';

export const runtime = 'nodejs';

const ID_REQUIRED = 'Identifiant de l’actualité requis';
const NOT_FOUND = 'Actualité introuvable';
/** Une actualité rédigée sur le site n'est jamais modifiée ni supprimée par le logiciel. */
const SITE_OWNED = 'Actualité gérée sur le site';

/** Réponse refusée sans écriture (levée DANS la transaction : rien n'est écrit). */
class SyncRefusal extends Error {
  constructor(readonly status: 404 | 409, message: string) {
    super(message);
  }
}

/**
 * Synchronisation des actualités depuis le logiciel de gestion (clé API).
 * - CREATE : crée (ou, avec un id existant d'origine SOFTWARE, remplace) ; origine SOFTWARE.
 * - UPDATE : PARTIEL, les champs absents sont conservés (publishedAt compris).
 * - DELETE : identifiant inconnu → 404.
 * Toute écriture visant une actualité d'origine SITE → 409, sans écriture.
 * La réponse garde les champs d'avant (ni origine ni auteur).
 */
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

    if ((action === 'DELETE' || action === 'UPDATE') && !news.id) {
      return jsonResponse({ success: false, message: ID_REQUIRED }, 400);
    }

    const log = (logAction: string, newsId: string) => ({
      data: {
        action: logAction,
        ipAddress: getClientIp(request.headers),
        userAgent: request.headers.get('user-agent'),
        details: { newsId },
      },
    });

    const synced = await prisma.$transaction(async (tx) => {
      // L'origine d'une actualité ne change jamais : la lire puis écrire dans la même transaction suffit.
      const existing = news.id ? await tx.news.findUnique({ where: { id: news.id }, select: { id: true, source: true } }) : null;

      if (existing?.source === 'SITE') {
        throw new SyncRefusal(409, SITE_OWNED);
      }

      if (action === 'DELETE') {
        if (!existing) throw new SyncRefusal(404, NOT_FOUND);
        await tx.news.delete({ where: { id: existing.id } });
        await tx.activityLog.create(log('news.sync.delete', existing.id));
        return null;
      }

      if (action === 'UPDATE') {
        if (!existing) throw new SyncRefusal(404, NOT_FOUND);
        // Seuls les champs FOURNIS sont écrits ; image "" efface l'image.
        const updated = await tx.news.update({
          where: { id: existing.id },
          data: {
            ...(news.title !== undefined ? { title: news.title } : {}),
            ...(news.content !== undefined ? { content: news.content } : {}),
            ...(news.image !== undefined ? { image: news.image || null } : {}),
            ...(news.category !== undefined ? { category: news.category } : {}),
            ...(news.publishedAt !== undefined ? { publishedAt: news.publishedAt } : {}),
            ...(news.isPublished !== undefined ? { isPublished: news.isPublished } : {}),
          },
          select: PUBLIC_NEWS_SELECT,
        });
        await tx.activityLog.create(log('news.sync.update', updated.id));
        return updated;
      }

      // CREATE : enregistrement complet, comme avant (valeurs par défaut pour les champs absents).
      const data = {
        title: news.title ?? '',
        content: news.content ?? '',
        image: news.image || null,
        category: news.category ?? NewsCategory.GENERAL,
        publishedAt: news.publishedAt ?? new Date(),
        isPublished: news.isPublished ?? true,
        source: 'SOFTWARE' as const,
      };
      const created = existing
        ? await tx.news.update({ where: { id: existing.id }, data, select: PUBLIC_NEWS_SELECT })
        : await tx.news.create({ data: { ...(news.id ? { id: news.id } : {}), ...data }, select: PUBLIC_NEWS_SELECT });
      await tx.activityLog.create(log('news.sync.create', created.id));
      return created;
    });

    return synced
      ? jsonResponse({ success: true, message: 'Actualité synchronisée', data: synced })
      : jsonResponse({ success: true, message: 'Actualité supprimée' });
  } catch (error) {
    const tooLarge = payloadTooLargeResponse(error);

    if (tooLarge) {
      return tooLarge;
    }

    if (error instanceof SyncRefusal) {
      return jsonResponse({ success: false, message: error.message }, error.status);
    }

    // Actualité supprimée entre la lecture et l'écriture.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return jsonResponse({ success: false, message: NOT_FOUND }, 404);
    }

    logger.error('News sync failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de synchroniser l’actualité' }, 500);
  }
}
