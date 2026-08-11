import { NextResponse, type NextRequest } from 'next/server';
import { bookSelect } from '@/lib/books';
import { jsonResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

interface BookRouteContext {
  params: Promise<{
    id: string;
  }>;
}

async function getBookId(context: BookRouteContext): Promise<string> {
  const params = await context.params;

  return params.id;
}

export async function GET(_request: NextRequest, context: BookRouteContext): Promise<NextResponse> {
  try {
    const id = await getBookId(context);
    const book = await prisma.book.findFirst({
      where: {
        OR: [{ id }, { externalId: id }, { isbn: id }],
      },
      select: bookSelect,
    });

    if (!book) {
      return jsonResponse({ success: false, message: 'Livre introuvable' }, 404);
    }

    return jsonResponse({ success: true, data: book });
  } catch (error) {
    logger.error('Book detail failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de récupérer le livre' }, 500);
  }
}
