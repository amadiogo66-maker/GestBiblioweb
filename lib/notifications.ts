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
  /** Liste publiée pour le département : titre de la liste seulement, jamais le nom de l'enseignant. */
  readingListPublished(listTitle: string): NotificationText {
    return {
      type: 'GENERAL',
      title: 'Nouvelle liste de lecture',
      message: `Une nouvelle liste de lecture est disponible pour votre département : "${listTitle}". Consultez Listes de lecture.`,
    };
  },
  /** Suivi d'une proposition d'acquisition : titre de l'ouvrage seulement, aucune donnée personnelle. */
  acquisitionUpdate(status: 'DEPT_APPROVED' | 'DEPT_REJECTED' | 'LIBRARY_ACCEPTED' | 'LIBRARY_REJECTED' | 'ACQUIRED', bookTitle: string): NotificationText {
    switch (status) {
      case 'DEPT_APPROVED':
        return {
          type: 'GENERAL',
          title: 'Proposition validée',
          message: `Votre proposition d'acquisition de "${bookTitle}" a été validée par votre département et transmise à la bibliothèque.`,
        };
      case 'DEPT_REJECTED':
        return {
          type: 'GENERAL',
          title: 'Proposition non retenue',
          message: `Votre proposition d'acquisition de "${bookTitle}" n'a pas été retenue par votre département. Le motif figure dans vos propositions.`,
        };
      case 'LIBRARY_ACCEPTED':
        return { type: 'GENERAL', title: 'Proposition acceptée', message: `La bibliothèque a accepté d'acquérir "${bookTitle}".` };
      case 'LIBRARY_REJECTED':
        return {
          type: 'GENERAL',
          title: 'Proposition refusée',
          message: `La bibliothèque n'a pas retenu l'acquisition de "${bookTitle}". Le motif figure dans vos propositions.`,
        };
      case 'ACQUIRED':
        return {
          type: 'NEW_ACQUISITION',
          title: 'Ouvrage acquis',
          message: `"${bookTitle}" a été acquis par la bibliothèque et sera bientôt disponible au catalogue.`,
        };
    }
  },
};
