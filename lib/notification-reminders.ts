import type { PrismaClient } from '@prisma/client';
import { notificationTexts, type NewNotification } from '@/lib/notifications';

const DUE_SOON_DAYS = 3;
const BATCH_SIZE = 1000;

export interface ReminderReport {
  overdue: number;
  dueSoon: number;
  /** Rappels déjà envoyés pour la même échéance. */
  alreadySent: number;
  created: number;
}

/**
 * Rappels planifiés : retard (prêts ACTIVE ou OVERDUE dont l'échéance est
 * dépassée) et échéance proche (prêts ACTIVE, 3 jours ou moins). Un seul rappel
 * par prêt, par type et par échéance. Sans apply, aucune écriture.
 * N'écrit jamais Loan.status : ce statut appartient au logiciel de gestion.
 */
export async function generateLoanReminders(
  db: Pick<PrismaClient, 'loan' | 'notification'>,
  options: { apply: boolean; now?: Date; onlyUserIds?: string[] }
): Promise<ReminderReport> {
  const now = options.now ?? new Date();
  const soon = new Date(now.getTime() + DUE_SOON_DAYS * 24 * 60 * 60 * 1000);
  const loans = await db.loan.findMany({
    where: {
      userId: options.onlyUserIds ? { in: options.onlyUserIds } : { not: null },
      OR: [
        { status: { in: ['ACTIVE', 'OVERDUE'] }, dueDate: { lt: now } },
        { status: 'ACTIVE', dueDate: { gte: now, lte: soon } },
      ],
    },
    select: { id: true, userId: true, dueDate: true, book: { select: { title: true } } },
  });

  let overdue = 0;
  let dueSoon = 0;
  const candidates: NewNotification[] = loans.map((loan) => {
    const isOverdue = loan.dueDate < now;
    const due = loan.dueDate.toISOString();

    if (isOverdue) overdue += 1;
    else dueSoon += 1;

    return {
      ...(isOverdue ? notificationTexts.loanOverdue(loan.book.title, loan.dueDate) : notificationTexts.loanDueSoon(loan.book.title, loan.dueDate)),
      userId: loan.userId as string,
      dedupeKey: `loan:${loan.id}:${isOverdue ? 'overdue' : 'due-soon'}:${due}`,
      source: 'site',
    };
  });

  let alreadySent = 0;
  let created = 0;

  for (let start = 0; start < candidates.length; start += BATCH_SIZE) {
    const batch = candidates.slice(start, start + BATCH_SIZE);

    if (options.apply) {
      const { count } = await db.notification.createMany({ data: batch, skipDuplicates: true });
      created += count;
      alreadySent += batch.length - count;
    } else {
      alreadySent += await db.notification.count({ where: { dedupeKey: { in: batch.map((item) => item.dedupeKey) } } });
    }
  }

  return { overdue, dueSoon, alreadySent, created };
}
