import { NextResponse, type NextRequest } from 'next/server';
import { listNewsSchema } from '@/schemas/news';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import type { PaginatedResponse } from '@/types';

export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const query = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = listNewsSchema.safeParse(query);

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const { page, limit, category } = parsed.data;
    const skip = (page - 1) * limit;
    const where = {
      isPublished: true,
      ...(category ? { category } : {}),
    };

    const [news, total] = await prisma.$transaction([
      prisma.news.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.news.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return jsonResponse<PaginatedResponse<(typeof news)[number]>>({
      success: true,
      data: {
        data: news,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
    });
  } catch (error) {
    logger.error('News list failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de récupérer les actualités' }, 500);
  }
}
