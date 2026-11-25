import { NextResponse, type NextRequest } from 'next/server';
import { listNewsSchema } from '@/schemas/news';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { logger } from '@/lib/logger';
import { searchNews, type PublicNews } from '@/lib/news-data';
import type { PaginatedResponse } from '@/types';

export const runtime = 'nodejs';

/** Actualités PUBLIÉES seulement (même lecture que les pages publiques). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const query = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = listNewsSchema.safeParse(query);

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const { page, limit, category } = parsed.data;
    const result = await searchNews(page, limit, category);
    // Forme de réponse inchangée : totalPages vaut 0 quand il n'y a aucune actualité.
    const totalPages = Math.ceil(result.pagination.total / limit);

    return jsonResponse<PaginatedResponse<PublicNews>>({
      success: true,
      data: { data: result.data, pagination: { ...result.pagination, totalPages, hasNext: page < totalPages } },
    });
  } catch (error) {
    logger.error('News list failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de récupérer les actualités' }, 500);
  }
}
