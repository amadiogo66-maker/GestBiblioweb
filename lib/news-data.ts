import { NewsCategory, type Prisma } from '@prisma/client';
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

/** Options de catégorie pour les formulaires clients (valeurs simples, aucun import Prisma côté client). */
export const newsCategoryOptions = (): Array<{ value: string; label: string }> =>
  NEWS_CATEGORIES.map((value) => ({ value, label: NEWS_CATEGORY_LABELS[value] ?? value }));

/**
 * LECTURE PUBLIQUE des actualités (accueil, /actualites, /api/news) : seules
 * les actualités PUBLIÉES et datées sont lues, quelle que soit leur origine.
 * Un brouillon ou une actualité dépubliée se comporte comme un identifiant
 * inconnu. Champs publics seulement (ni auteur, ni origine).
 */
export const PUBLIC_NEWS_WHERE = { isPublished: true, publishedAt: { not: null } } satisfies Prisma.NewsWhereInput;

export const PUBLIC_NEWS_SELECT = {
  id: true,
  title: true,
  content: true,
  image: true,
  category: true,
  publishedAt: true,
  isPublished: true,
  createdAt: true,
} satisfies Prisma.NewsSelect;

type PublicNewsRow = Prisma.NewsGetPayload<{ select: typeof PUBLIC_NEWS_SELECT }>;
/** Actualité publique : publishedAt toujours renseigné (filtré par PUBLIC_NEWS_WHERE). */
export type PublicNews = Omit<PublicNewsRow, 'publishedAt'> & { publishedAt: Date };

const toPublic = (row: PublicNewsRow): PublicNews => ({ ...row, publishedAt: row.publishedAt ?? row.createdAt });

const publicOrder = [{ publishedAt: 'desc' }, { id: 'asc' }] satisfies Prisma.NewsOrderByWithRelationInput[];

export async function searchNews(page: number, limit: number, category?: NewsCategory): Promise<PaginatedResponse<PublicNews>> {
  const where: Prisma.NewsWhereInput = { ...PUBLIC_NEWS_WHERE, ...(category ? { category } : {}) };
  const skip = (page - 1) * limit;

  const [rows, total] = await prisma.$transaction([
    prisma.news.findMany({ where, orderBy: publicOrder, skip, take: limit, select: PUBLIC_NEWS_SELECT }),
    prisma.news.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    data: rows.map(toPublic),
    pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
  };
}

/** Actualité publiée ; null pour un brouillon, une actualité dépubliée ou un identifiant inconnu. */
export async function getPublishedNewsById(id: string): Promise<PublicNews | null> {
  const row = await prisma.news.findFirst({ where: { id, ...PUBLIC_NEWS_WHERE }, select: PUBLIC_NEWS_SELECT });

  return row ? toPublic(row) : null;
}

export async function getRelatedNews(id: string, category: NewsCategory, limit: number): Promise<PublicNews[]> {
  const rows = await prisma.news.findMany({
    where: { id: { not: id }, category, ...PUBLIC_NEWS_WHERE },
    orderBy: publicOrder,
    take: limit,
    select: PUBLIC_NEWS_SELECT,
  });

  return rows.map(toPublic);
}

export async function getLatestNews(limit: number): Promise<PublicNews[]> {
  const rows = await prisma.news.findMany({ where: PUBLIC_NEWS_WHERE, orderBy: publicOrder, take: limit, select: PUBLIC_NEWS_SELECT });

  return rows.map(toPublic);
}
