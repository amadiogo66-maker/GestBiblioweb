/** Libellés des types de notification (littéraux, sans import de valeur Prisma). */
export type NotificationTypeValue =
  | 'OVERDUE'
  | 'BOOK_AVAILABLE'
  | 'NEW_ACQUISITION'
  | 'ANNOUNCEMENT'
  | 'RESERVATION_EXPIRING'
  | 'GENERAL';

export const NOTIFICATION_TYPE_LABELS: Record<
  NotificationTypeValue,
  { label: string; variant: 'success' | 'danger' | 'neutral' | 'primary' | 'new' }
> = {
  OVERDUE: { label: 'Retard', variant: 'danger' },
  BOOK_AVAILABLE: { label: 'Disponible', variant: 'success' },
  NEW_ACQUISITION: { label: 'Nouveauté', variant: 'new' },
  ANNOUNCEMENT: { label: 'Annonce', variant: 'primary' },
  RESERVATION_EXPIRING: { label: 'Expiration', variant: 'danger' },
  GENERAL: { label: 'Information', variant: 'neutral' },
};
