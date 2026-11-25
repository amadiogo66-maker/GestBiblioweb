import { NextResponse, type NextRequest } from 'next/server';
import { jsonResponse } from '@/lib/api';
import { logger } from '@/lib/logger';
import { getPublishedNewsById } from '@/lib/news-data';

export const runtime = 'nodejs';

interface NewsRouteContext {
  params: Promise<{ id: string }>;
}

/** Actualité PUBLIÉE seulement : un brouillon ou une actualité dépubliée répond 404, comme un identifiant inconnu. */
export async function GET(_request: NextRequest, context: NewsRouteContext): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const news = await getPublishedNewsById(id);

    if (!news) {
      return jsonResponse({ success: false, message: 'Actualité introuvable' }, 404);
    }

    return jsonResponse({ success: true, data: news });
  } catch (error) {
    logger.error('News fetch failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de récupérer l’actualité' }, 500);
  }
}
