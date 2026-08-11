import { z } from 'zod';
import { BookStatus } from '@prisma/client';

export const searchBooksSchema = z.object({
  query: z.string().trim().max(200).optional(),
  department: z.string().trim().max(100).optional(),
  category: z.string().trim().max(100).optional(),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  status: z.nativeEnum(BookStatus).optional(),
  availability: z.enum(['available', 'unavailable', 'all']).optional().default('all'),
  isNew: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['title', 'author', 'year', 'createdAt', 'loanCount']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const bookBaseSchema = z.object({
  externalId: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(255),
  author: z.string().trim().min(1).max(255),
  isbn: z.string().trim().min(10).max(20),
  publisher: z.string().trim().max(255).optional(),
  summary: z.string().trim().max(5000).optional(),
  coverImage: z.string().trim().url().optional().or(z.literal('')),
  year: z.number().int().min(1900).max(2100).optional(),
  department: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(100),
  location: z.string().trim().max(100).optional(),
  totalCopies: z.number().int().min(1).max(10000).default(1),
  availableCopies: z.number().int().min(0).max(10000).optional(),
  status: z.nativeEnum(BookStatus).default(BookStatus.AVAILABLE),
  isNew: z.boolean().default(false),
  loanCount: z.number().int().min(0).max(100000).default(0),
});

export const createBookSchema = bookBaseSchema
  .refine((data) => data.availableCopies === undefined || data.availableCopies <= data.totalCopies, {
    message: 'Available copies cannot exceed total copies',
    path: ['availableCopies'],
  });

export const updateBookSchema = bookBaseSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  })
  .refine(
    (data) => data.availableCopies === undefined || data.totalCopies === undefined || data.availableCopies <= data.totalCopies,
    {
      message: 'Available copies cannot exceed total copies',
      path: ['availableCopies'],
    }
  );

export const syncBookSchema = z.object({
  action: z.enum(['CREATE', 'UPDATE', 'DELETE']),
  book: createBookSchema,
});
