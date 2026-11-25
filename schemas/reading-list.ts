import { z } from 'zod';

/**
 * Listes de lectures. Texte brut uniquement : les valeurs sont stockées telles
 * quelles et toujours affichées échappées par React (aucun HTML interprété).
 */

const id = z.string().trim().min(1).max(50);

/** Texte facultatif : vide → absent (création) ; null → effacé (modification). */
function optionalText(min: number, max: number, label: string) {
  return z
    .string()
    .trim()
    .max(max, `${label} : ${max} caractères au maximum`)
    .refine((value) => value.length === 0 || value.length >= min, `${label} : ${min} caractère(s) au minimum`)
    .transform((value) => (value.length === 0 ? null : value));
}

const title = z.string().trim().min(1, 'Le titre est obligatoire').max(150, 'Le titre est limité à 150 caractères');
const courseCode = optionalText(1, 40, 'Code du cours');
const description = optionalText(0, 1000, 'Description');
const academicYear = z
  .string()
  .trim()
  .refine((value) => value === '' || /^\d{4}-\d{4}$/.test(value), 'Année universitaire au format 2026-2027')
  .refine((value) => value === '' || Number(value.slice(5)) === Number(value.slice(0, 4)) + 1, 'Année universitaire au format 2026-2027')
  .transform((value) => (value === '' ? null : value));

export const readingListCreateSchema = z
  .object({
    title,
    courseCode: courseCode.optional(),
    description: description.optional(),
    academicYear: academicYear.optional(),
    programId: id.nullish(),
  })
  .strict();

export const readingListUpdateSchema = z
  .object({
    title: title.optional(),
    courseCode: courseCode.nullish(),
    description: description.nullish(),
    academicYear: academicYear.nullish(),
    programId: id.nullish(),
    status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
    // Pris en compte seulement lors du passage à PUBLISHED.
    notifyStudents: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'notifyStudents'), 'Aucune modification demandée');

const note = z
  .string()
  .trim()
  .max(500, 'La note est limitée à 500 caractères')
  .transform((value) => (value.length === 0 ? null : value));

export const readingListItemAddSchema = z.object({ bookId: id, note: note.optional() }).strict();

export const readingListItemUpdateSchema = z
  .object({ note: note.nullish(), move: z.enum(['up', 'down']).optional() })
  .strict()
  .refine((value) => value.note !== undefined || value.move !== undefined, 'Aucune modification demandée');

export const readingListUnpublishSchema = z
  .object({
    reason: z.string().trim().min(5, 'Le motif doit contenir au moins 5 caractères').max(500, 'Le motif est limité à 500 caractères'),
  })
  .strict();

// Paramètres d'URL : une valeur invalide est ignorée.
const page = z.coerce.number().int().min(1).max(10_000).catch(1);
const slug = z.string().trim().max(80).regex(/^[a-z0-9-]*$/).optional().catch(undefined);

export const readingListsQuerySchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  departement: slug,
  programme: slug,
  page,
});

/** Recherche du catalogue (page d'édition d'une liste) : au-delà, la recherche est ignorée. */
export const CATALOG_SEARCH_MAX = 100;

export const catalogSearchQuerySchema = z.object({
  q: z.string().trim().max(CATALOG_SEARCH_MAX).optional().catch(undefined),
});

export type ReadingListCreateInput = z.infer<typeof readingListCreateSchema>;
export type ReadingListUpdateInput = z.infer<typeof readingListUpdateSchema>;
export type ReadingListsQuery = z.infer<typeof readingListsQuerySchema>;
