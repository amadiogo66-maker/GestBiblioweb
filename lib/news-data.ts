import { NewsCategory, type News, type Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { PaginatedResponse } from '@/types';

export const NEWS_CATEGORY_LABELS: Record<string, string> = {
  ANNOUNCEMENT: 'Annonce',
  EVENT: 'Événement',
  CONFERENCE: 'Conférence',
  NEW_BOOK: 'Nouvel ouvrage',
  GENERAL: 'Général',
};

export const NEWS_CATEGORIES = Object.values(NewsCategory);

export async function searchNews(page: number, limit: number, category?: NewsCategory): Promise<PaginatedResponse<News>> {
  const where: Prisma.NewsWhereInput = { isPublished: true, ...(category ? { category } : {}) };
  const skip = (page - 1) * limit;

  const [data, total] = await prisma.$transaction([
    prisma.news.findMany({ where, orderBy: { publishedAt: 'desc' }, skip, take: limit }),
    prisma.news.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    data,
    pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
  };
}

export function getNewsById(id: string): Promise<News | null> {
  return prisma.news.findUnique({ where: { id } });
}

export function getRelatedNews(id: string, category: NewsCategory, limit: number): Promise<News[]> {
  return prisma.news.findMany({
    where: { id: { not: id }, category, isPublished: true },
    orderBy: { publishedAt: 'desc' },
    take: limit,
  });
}
