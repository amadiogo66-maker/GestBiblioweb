import { z } from 'zod';

/** ISBN normalisé : chiffres (et X final pour un ISBN-10), sans tirets ni espaces. */
export function normalizeIsbn(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} : ${max} caractères au maximum`)
    .transform((value) => (value.length === 0 ? null : value));

export const acquisitionCreateSchema = z
  .object({
    title: z.string().trim().min(1, 'Le titre est obligatoire').max(200, 'Le titre est limité à 200 caractères'),
    author: z.string().trim().min(1, "L'auteur est obligatoire").max(150, "L'auteur est limité à 150 caractères"),
    isbn: z
      .string()
      .trim()
      .transform(normalizeIsbn)
      .refine((value) => value === '' || /^(\d{9}[\dX]|\d{13})$/.test(value), 'ISBN invalide (10 ou 13 caractères)')
      .transform((value) => (value === '' ? null : value))
      .optional(),
    publisher: optionalText(150, 'Éditeur').optional(),
    year: z
      .number()
      .int()
      .min(1450, 'Année invalide')
      .max(new Date().getFullYear() + 1, 'Année invalide')
      .nullish(),
    justification: z
      .string()
      .trim()
      .min(10, 'La justification doit contenir au moins 10 caractères')
      .max(1000, 'La justification est limitée à 1000 caractères'),
    /** L'enseignant a vu l'avertissement de doublon et confirme. */
    acknowledgeDuplicates: z.boolean().optional(),
  })
  .strict();

const reason = z.string().trim().min(5, 'Le motif doit contenir au moins 5 caractères').max(500, 'Le motif est limité à 500 caractères');
const note = z.string().trim().max(500, 'La note est limitée à 500 caractères').optional();

/**
 * Décision sur une proposition. approve / reject : responsable du département
 * (ou ADMIN / LIBRARIAN à sa place) ; accept / refuse / acquired : bibliothèque.
 * Un refus exige un motif.
 */
export const acquisitionDecisionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve'), note }).strict(),
  z.object({ action: z.literal('reject'), note: reason }).strict(),
  z.object({ action: z.literal('accept'), note }).strict(),
  z.object({ action: z.literal('refuse'), note: reason }).strict(),
  z.object({ action: z.literal('acquired'), note }).strict(),
]);

const page = z.coerce.number().int().min(1).max(10_000).catch(1);

export const acquisitionsQuerySchema = z.object({
  statut: z
    .enum(['SUBMITTED', 'DEPT_APPROVED', 'DEPT_REJECTED', 'LIBRARY_ACCEPTED', 'LIBRARY_REJECTED', 'ACQUIRED'])
    .optional()
    .catch(undefined),
  departement: z.string().trim().max(80).regex(/^[a-z0-9-]*$/).optional().catch(undefined),
  page,
});

/** Préremplissage du formulaire depuis la recherche du catalogue. */
export const acquisitionPrefillSchema = z.object({
  titre: z.string().trim().max(200).optional().catch(undefined),
});

export type AcquisitionCreateInput = z.infer<typeof acquisitionCreateSchema>;
export type AcquisitionDecisionInput = z.infer<typeof acquisitionDecisionSchema>;
export type AcquisitionDecisionAction = AcquisitionDecisionInput['action'];
