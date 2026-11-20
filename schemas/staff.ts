import { z } from 'zod';

/** Corps de PATCH /api/staff/accounts/[id]/status. */
export const moderationSchema = z.object({
  action: z.enum(['suspend', 'ban', 'reactivate']),
  reason: z.string().trim().min(5, 'Le motif doit contenir au moins 5 caractères').max(500, 'Le motif est limité à 500 caractères'),
});

export type ModerationInput = z.infer<typeof moderationSchema>;

// Paramètres d'URL des listes : une valeur invalide est ignorée (pas d'erreur 400 sur une page).
const optionalText = z.string().trim().max(100).optional().catch(undefined);
const page = z.coerce.number().int().min(1).max(10_000).catch(1);

export const staffAccountsQuerySchema = z.object({
  q: optionalText,
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'BANNED']).optional().catch(undefined),
  role: z.enum(['STUDENT', 'TEACHER', 'VISITOR']).optional().catch(undefined),
  departmentId: z.string().trim().max(50).optional().catch(undefined),
  page,
});

export type StaffAccountsQuery = z.infer<typeof staffAccountsQuerySchema>;

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined);

export const auditLogQuerySchema = z.object({
  action: z.string().trim().max(60).regex(/^[a-z_.]*$/).optional().catch(undefined),
  actor: optionalText,
  from: isoDay,
  to: isoDay,
  page,
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

/** Lit des searchParams Next (valeurs simples ou tableaux) en objet plat. */
export function flattenSearchParams(params: Record<string, string | string[] | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params)
      .map(([key, value]) => [key, Array.isArray(value) ? value[0] : value] as const)
      .filter((entry): entry is readonly [string, string] => typeof entry[1] === 'string')
  );
}
