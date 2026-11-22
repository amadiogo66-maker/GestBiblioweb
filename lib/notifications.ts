import type { NotificationType, Prisma } from '@prisma/client';

export const notificationSelect = {
  id: true,
  userId: true,
  type: true,
  title: true,
  message: true,
  isRead: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

export type NotificationSource = 'site' | 'software';

export interface NewNotification {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  dedupeKey: string;
  source: NotificationSource;
  isRead?: boolean;
}

/**
 * Crée une notification, sans effet si dedupeKey existe déjà
 * (INSERT ... ON CONFLICT DO NOTHING). Utilisable dans une transaction.
 * Renvoie true si une ligne a été créée.
 */
export async function createNotification(db: Pick<Prisma.TransactionClient, 'notification'>, input: NewNotification): Promise<boolean> {
  const { count } = await db.notification.createMany({ data: [input], skipDuplicates: true });

  return count === 1;
}

/** Date lisible, à l'heure de Conakry quel que soit le fuseau du serveur. */
export function formatNotificationDate(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Africa/Conakry' }).format(date);
}

type NotificationText = Pick<NewNotification, 'type' | 'title' | 'message'>;

export const notificationTexts = {
  reservationReady(bookTitle: string, expiryDate: Date | null): NotificationText {
    return {
      type: 'BOOK_AVAILABLE',
      title: 'Réservation prête',
      message: expiryDate
        ? `Votre réservation de "${bookTitle}" est prête, elle est conservée jusqu'au ${formatNotificationDate(expiryDate)}.`
        : `Votre réservation de "${bookTitle}" est prête, présentez-vous au guichet.`,
    };
  },
  reservationExpired(bookTitle: string): NotificationText {
    return {
      type: 'GENERAL',
      title: 'Réservation expirée',
      message: `Votre réservation de "${bookTitle}" a expiré. Vous pouvez la renouveler depuis la fiche de l'ouvrage.`,
    };
  },
  renewalGranted(bookTitle: string, dueDate: Date): NotificationText {
    return {
      type: 'GENERAL',
      title: 'Renouvellement accepté',
      message: `Votre emprunt de "${bookTitle}" est renouvelé jusqu'au ${formatNotificationDate(dueDate)}.`,
    };
  },
  renewalRefused(bookTitle: string): NotificationText {
    return {
      type: 'GENERAL',
      title: 'Renouvellement refusé',
      message: `Le renouvellement de "${bookTitle}" a été refusé. Rapprochez-vous du guichet.`,
    };
  },
  loanOverdue(bookTitle: string, dueDate: Date): NotificationText {
    return {
      type: 'OVERDUE',
      title: 'Emprunt en retard',
      message: `Votre emprunt de "${bookTitle}" devait être rendu le ${formatNotificationDate(dueDate)}. Merci de le rapporter à la bibliothèque.`,
    };
  },
  loanDueSoon(bookTitle: string, dueDate: Date): NotificationText {
    return {
      type: 'GENERAL',
      title: 'Échéance proche',
      message: `Votre emprunt de "${bookTitle}" est à rendre au plus tard le ${formatNotificationDate(dueDate)}.`,
    };
  },
};
