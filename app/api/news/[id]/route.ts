import { NextResponse, type NextRequest } from 'next/server';
import { jsonResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

interface NewsRouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: NewsRouteContext): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const news = await prisma.news.findUnique({ where: { id } });

    if (!news) {
      return jsonResponse({ success: false, message: 'Actualité introuvable' }, 404);
    }

    return jsonResponse({ success: true, data: news });
  } catch (error) {
    logger.error('News fetch failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de récupérer l’actualité' }, 500);
  }
}
