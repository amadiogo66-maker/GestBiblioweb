import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { READING_LIST_NOTIFY } from '@/lib/constants';
import { notificationTexts } from '@/lib/notifications';

/**
 * Notification des étudiants à la publication d'une liste de lectures.
 *
 * Destinataires : comptes ACTIVE, de rôle STUDENT, du département de la liste
 * (relu en base), hors auteur. Une seule campagne par liste : dès qu'une
 * notification de cette liste existe, aucune autre n'est envoyée (republier ne
 * renotifie pas, un étudiant arrivé plus tard ne reçoit rien rétroactivement).
 */

const dedupePrefix = (listId: string): string => `reading-list:${listId}:published:`;

export const readingListDedupeKey = (listId: string, userId: string): string => `${dedupePrefix(listId)}${userId}`;

export function notificationRecipientsWhere(departmentId: string | null, authorId: string): Prisma.UserWhereInput {
  return {
    status: 'ACTIVE',
    role: 'STUDENT',
    // Département vide : aucun destinataire (filtre impossible plutôt que « tous »).
    departmentId: departmentId ?? '__aucun__',
    id: { not: authorId },
  };
}

type Db = Pick<Prisma.TransactionClient, 'notification' | 'user'>;

/** Les étudiants ont-ils déjà été prévenus pour cette liste ? (une requête) */
export async function readingListAlreadyNotified(listId: string, db: Pick<Prisma.TransactionClient, 'notification'> = prisma): Promise<boolean> {
  const existing = await db.notification.findFirst({ where: { dedupeKey: { startsWith: dedupePrefix(listId) } }, select: { id: true } });

  return existing !== null;
}

/** Nombre approximatif de destinataires, affiché à l'enseignant (comptage agrégé). */
export async function countReadingListRecipients(departmentId: string, authorId: string): Promise<number> {
  return prisma.user.count({ where: notificationRecipientsWhere(departmentId, authorId) });
}

export interface NotifyResult {
  notified: number;
  /** Destinataires écartés par le plafond par publication. */
  notNotified: number;
  alreadyNotified: boolean;
}

/**
 * À appeler DANS la transaction de publication : si elle échoue, aucune
 * notification ne subsiste. Insertion par lots, sans doublon (dedupeKey).
 */
export async function notifyReadingListPublished(
  tx: Db,
  list: { id: string; title: string; departmentId: string | null },
  authorId: string
): Promise<NotifyResult> {
  if (!list.departmentId) {
    return { notified: 0, notNotified: 0, alreadyNotified: false };
  }

  if (await readingListAlreadyNotified(list.id, tx)) {
    return { notified: 0, notNotified: 0, alreadyNotified: true };
  }

  const where = notificationRecipientsWhere(list.departmentId, authorId);
  const [total, recipients] = await Promise.all([
    tx.user.count({ where }),
    tx.user.findMany({ where, select: { id: true }, orderBy: { id: 'asc' }, take: READING_LIST_NOTIFY.maxRecipients }),
  ]);
  const text = notificationTexts.readingListPublished(list.title);
  let notified = 0;

  for (let start = 0; start < recipients.length; start += READING_LIST_NOTIFY.batchSize) {
    const batch = recipients.slice(start, start + READING_LIST_NOTIFY.batchSize);
    const { count } = await tx.notification.createMany({
      data: batch.map(({ id }) => ({ userId: id, ...text, dedupeKey: readingListDedupeKey(list.id, id), source: 'site' })),
      skipDuplicates: true,
    });
    notified += count;
  }

  return { notified, notNotified: Math.max(0, total - recipients.length), alreadyNotified: false };
}
