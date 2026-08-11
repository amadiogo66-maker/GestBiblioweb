import { BookStatus, Prisma } from '@prisma/client';
import type { z } from 'zod';
import type { createBookSchema, searchBooksSchema, updateBookSchema } from '@/schemas/book';

export const bookSelect = {
  id: true,
  externalId: true,
  title: true,
  author: true,
  isbn: true,
  publisher: true,
  summary: true,
  coverImage: true,
  year: true,
  department: true,
  category: true,
  location: true,
  totalCopies: true,
  availableCopies: true,
  status: true,
  isNew: true,
  loanCount: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.BookSelect;

export type BookSearchInput = z.infer<typeof searchBooksSchema>;
export type CreateBookInput = z.infer<typeof createBookSchema>;
export type UpdateBookInput = z.infer<typeof updateBookSchema>;

export function buildBookWhere(input: BookSearchInput): Prisma.BookWhereInput {
  const where: Prisma.BookWhereInput = {};

  if (input.query) {
    where.OR = [
      { title: { contains: input.query, mode: 'insensitive' } },
      { author: { contains: input.query, mode: 'insensitive' } },
      { isbn: { contains: input.query, mode: 'insensitive' } },
      { externalId: { contains: input.query, mode: 'insensitive' } },
      { publisher: { contains: input.query, mode: 'insensitive' } },
    ];
  }

  if (input.department) {
    where.department = { equals: input.department, mode: 'insensitive' };
  }

  if (input.category) {
    where.category = { equals: input.category, mode: 'insensitive' };
  }

  if (input.year !== undefined) {
    where.year = input.year;
  }

  if (input.status) {
    where.status = input.status;
  }

  if (input.isNew !== undefined) {
    where.isNew = input.isNew;
  }

  if (input.availability === 'available') {
    where.availableCopies = { gt: 0 };
    where.status = input.status ?? BookStatus.AVAILABLE;
  }

  if (input.availability === 'unavailable') {
    where.OR = [...(where.OR ?? []), { availableCopies: { lte: 0 } }, { status: { not: BookStatus.AVAILABLE } }];
  }

  return where;
}

export function toBookCreateData(input: CreateBookInput): Prisma.BookCreateInput {
  return {
    ...input,
    publisher: input.publisher || null,
    summary: input.summary || null,
    coverImage: input.coverImage || null,
    location: input.location || null,
    availableCopies: input.availableCopies ?? input.totalCopies,
    loanCount: input.loanCount,
  };
}

export function toBookUpdateData(input: UpdateBookInput): Prisma.BookUpdateInput {
  const data: Prisma.BookUpdateInput = { ...input };

  if ('publisher' in input) {
    data.publisher = input.publisher || null;
  }

  if ('summary' in input) {
    data.summary = input.summary || null;
  }

  if ('coverImage' in input) {
    data.coverImage = input.coverImage || null;
  }

  if ('location' in input) {
    data.location = input.location || null;
  }

  return data;
}
