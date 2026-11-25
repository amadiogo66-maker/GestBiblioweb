import { z } from 'zod';
import { NewsCategory } from '@prisma/client';

export const listNewsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  category: z.nativeEnum(NewsCategory).optional(),
});

/**
 * Webhook news/sync (logiciel de gestion). Contrat de REQUÊTE inchangé :
 * mêmes champs, mêmes bornes.
 */
export const newsSyncSchema = z.object({
  action: z.enum(['CREATE', 'UPDATE', 'DELETE']),
  news: z.object({
    id: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    content: z.string().trim().min(1).max(4000).optional(),
    image: z.string().url().optional().or(z.literal('')).optional(),
    category: z.nativeEnum(NewsCategory).optional(),
    publishedAt: z.coerce.date().optional(),
    isPublished: z.boolean().optional(),
  }),
});

export type NewsSyncInput = z.infer<typeof newsSyncSchema>;

/*
 * Actualités rédigées sur le site (espace du personnel). TEXTE BRUT : stocké
 * tel quel (fins de ligne normalisées) et toujours affiché échappé par React ;
 * les sauts de ligne sont conservés à l'affichage (white-space: pre-line).
 */
const title = z.string().trim().min(3, 'Le titre doit contenir au moins 3 caractères').max(150, 'Le titre est limité à 150 caractères');
const content = z
  .string()
  .transform((value) => value.replace(/\r\n?/g, '\n').trim())
  .pipe(z.string().min(10, 'Le contenu doit contenir au moins 10 caractères').max(10_000, 'Le contenu est limité à 10 000 caractères'));
const category = z.nativeEnum(NewsCategory, { errorMap: () => ({ message: 'Catégorie inconnue' }) });

export const staffNewsCreateSchema = z
  .object({ title, content, category, isPublished: z.boolean().optional().default(false) })
  .strict();

export const staffNewsUpdateSchema = z
  .object({ title: title.optional(), content: content.optional(), category: category.optional(), isPublished: z.boolean().optional() })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Aucune modification demandée');

export type StaffNewsCreateInput = z.infer<typeof staffNewsCreateSchema>;
export type StaffNewsUpdateInput = z.infer<typeof staffNewsUpdateSchema>;

// Filtres de /personnel/actualites (paramètres d'URL) : une valeur invalide est ignorée.
export const staffNewsQuerySchema = z.object({
  origine: z.enum(['site', 'logiciel']).optional().catch(undefined),
  etat: z.enum(['publiee', 'brouillon']).optional().catch(undefined),
  categorie: z.nativeEnum(NewsCategory).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export type StaffNewsQuery = z.infer<typeof staffNewsQuerySchema>;
