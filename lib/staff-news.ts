import type { NewsSource, StaffRole } from '@prisma/client';

/**
 * Actualités gérées depuis l'espace du personnel (ADMIN et LIBRARIAN).
 * Chaque actualité a UNE origine : le site ne touche jamais à une actualité
 * d'origine SOFTWARE (gérée dans le logiciel), et inversement (voir news/sync).
 */

export type NewsWriteAction = 'update' | 'delete';

export const NEWS_NOT_FOUND = 'Actualité introuvable';
export const SOFTWARE_NEWS_READ_ONLY = 'Actualité gérée dans le logiciel : modification impossible depuis le site';
export const NEWS_DELETE_ADMIN_ONLY = 'Suppression réservée aux administrateurs';

export type NewsWriteDecision = { allowed: true } | { allowed: false; httpStatus: 403; message: string };

/** Règle pure : origine d'abord (lecture seule pour SOFTWARE), puis suppression réservée à ADMIN. */
export function evaluateNewsWrite(roles: readonly StaffRole[], source: NewsSource, action: NewsWriteAction): NewsWriteDecision {
  if (source !== 'SITE') {
    return { allowed: false, httpStatus: 403, message: SOFTWARE_NEWS_READ_ONLY };
  }

  if (action === 'delete' && !roles.includes('ADMIN')) {
    return { allowed: false, httpStatus: 403, message: NEWS_DELETE_ADMIN_ONLY };
  }

  return { allowed: true };
}

/**
 * Date de publication : posée à la PREMIÈRE publication seulement. Dépublier
 * ne l'efface pas ; republier garde la date d'origine ; un brouillon jamais
 * publié n'en a pas.
 */
export function nextPublishedAt(current: Date | null, isPublished: boolean, now: Date = new Date()): Date | null {
  return current ?? (isPublished ? now : null);
}

/** Noms des champs réellement modifiés (journal : jamais les valeurs). */
export function changedNewsFields(
  before: { title: string; content: string; category: string; isPublished: boolean },
  input: Partial<{ title: string; content: string; category: string; isPublished: boolean }>
): Array<'title' | 'content' | 'category' | 'isPublished'> {
  return (['title', 'content', 'category', 'isPublished'] as const).filter((field) => input[field] !== undefined && input[field] !== before[field]);
}
