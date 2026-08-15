import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { bookSelect, buildBookWhere, type BookSearchInput } from '@/lib/books';
import type { PaginatedResponse } from '@/types';

export type CatalogueBook = Prisma.BookGetPayload<{ select: typeof bookSelect }>;

export async function searchCatalogueBooks(input: BookSearchInput): Promise<PaginatedResponse<CatalogueBook>> {
  const where = buildBookWhere(input);
  const skip = (input.page - 1) * input.limit;

  const [data, total] = await prisma.$transaction([
    prisma.book.findMany({
      where,
      select: bookSelect,
      orderBy: { [input.sortBy]: input.sortOrder },
      skip,
      take: input.limit,
    }),
    prisma.book.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / input.limit));

  return {
    data,
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages,
      hasNext: input.page < totalPages,
      hasPrev: input.page > 1,
    },
  };
}

export async function getPopularCatalogueBooks(page: number, limit: number): Promise<PaginatedResponse<CatalogueBook>> {
  const where: Prisma.BookWhereInput = { loanCount: { gt: 0 } };
  const skip = (page - 1) * limit;

  const [data, total] = await prisma.$transaction([
    prisma.book.findMany({ where, select: bookSelect, orderBy: { loanCount: 'desc' }, skip, take: limit }),
    prisma.book.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

export interface CatalogueMetadata {
  departments: string[];
  categories: string[];
  years: number[];
}

export async function getCatalogueMetadata(): Promise<CatalogueMetadata> {
  const [departments, categories, years] = await prisma.$transaction([
    prisma.book.findMany({ distinct: ['department'], select: { department: true }, orderBy: { department: 'asc' } }),
    prisma.book.findMany({ distinct: ['category'], select: { category: true }, orderBy: { category: 'asc' } }),
    prisma.book.findMany({
      where: { year: { not: null } },
      distinct: ['year'],
      select: { year: true },
      orderBy: { year: 'desc' },
    }),
  ]);

  return {
    departments: departments.map((item) => item.department),
    categories: categories.map((item) => item.category),
    years: years.map((item) => item.year).filter((year): year is number => year !== null),
  };
}
