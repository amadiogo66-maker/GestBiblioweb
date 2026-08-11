import { NextResponse } from 'next/server';
import { jsonResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  try {
    const [departments, categories, years] = await prisma.$transaction([
      prisma.book.findMany({
        distinct: ['department'],
        select: { department: true },
        orderBy: { department: 'asc' },
      }),
      prisma.book.findMany({
        distinct: ['category'],
        select: { category: true },
        orderBy: { category: 'asc' },
      }),
      prisma.book.findMany({
        where: { year: { not: null } },
        distinct: ['year'],
        select: { year: true },
        orderBy: { year: 'desc' },
      }),
    ]);

    return jsonResponse({
      success: true,
      data: {
        departments: departments.map((item) => item.department),
        categories: categories.map((item) => item.category),
        years: years.map((item) => item.year).filter((year): year is number => year !== null),
      },
    });
  } catch (error) {
    logger.error('Book metadata failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de récupérer les filtres du catalogue' }, 500);
  }
}

