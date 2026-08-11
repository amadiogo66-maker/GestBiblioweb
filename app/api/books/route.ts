import { NextResponse, type NextRequest } from 'next/server';
import { searchBooksSchema } from '@/schemas/book';
import { buildBookWhere, bookSelect } from '@/lib/books';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import type { PaginatedResponse } from '@/types';

export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const query = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = searchBooksSchema.safeParse(query);

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const { page, limit, sortBy, sortOrder } = parsed.data;
    const where = buildBookWhere(parsed.data);
    const skip = (page - 1) * limit;
    const [books, total] = await prisma.$transaction([
      prisma.book.findMany({
        where,
        select: bookSelect,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
      prisma.book.count({ where }),
    ]);
    const totalPages = Math.ceil(total / limit);

    return jsonResponse<PaginatedResponse<(typeof books)[number]>>({
      success: true,
      data: {
        data: books,
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
    logger.error('Book search failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de récupérer le catalogue' }, 500);
  }
}
