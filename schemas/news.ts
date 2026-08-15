import { z } from 'zod';
import { NewsCategory } from '@prisma/client';

export const listNewsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  category: z.nativeEnum(NewsCategory).optional(),
});

export const createNewsSchema = z.object({
  title: z.string().trim().min(3).max(200),
  content: z.string().trim().min(10).max(4000),
  image: z.string().url().optional().or(z.literal('')),
  category: z.nativeEnum(NewsCategory).optional().default(NewsCategory.GENERAL),
  isPublished: z.boolean().optional().default(true),
  publishedAt: z.coerce.date().optional(),
});

export const updateNewsSchema = createNewsSchema.partial();
