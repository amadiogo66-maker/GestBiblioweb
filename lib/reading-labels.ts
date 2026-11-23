/**
 * Libellés des listes de lectures et des propositions d'acquisition.
 * Littéraux uniquement (aucun import de valeur depuis @prisma/client) :
 * utilisables dans les composants client.
 */

export type ReadingListStatusValue = 'DRAFT' | 'PUBLISHED';
export type AcquisitionStatusValue = 'SUBMITTED' | 'DEPT_APPROVED' | 'DEPT_REJECTED' | 'LIBRARY_ACCEPTED' | 'LIBRARY_REJECTED' | 'ACQUIRED';
type BadgeVariant = 'success' | 'danger' | 'neutral' | 'new' | 'primary';

export const READING_LIST_STATUS_LABELS: Record<ReadingListStatusValue, string> = {
  DRAFT: 'Brouillon',
  PUBLISHED: 'Publiée',
};

export const READING_LIST_STATUS_BADGE: Record<ReadingListStatusValue, BadgeVariant> = {
  DRAFT: 'neutral',
  PUBLISHED: 'success',
};

export const ACQUISITION_STATUS_LABELS: Record<AcquisitionStatusValue, string> = {
  SUBMITTED: 'En attente du département',
  DEPT_APPROVED: 'Validée par le département',
  DEPT_REJECTED: 'Refusée par le département',
  LIBRARY_ACCEPTED: 'Acceptée par la bibliothèque',
  LIBRARY_REJECTED: 'Refusée par la bibliothèque',
  ACQUIRED: 'Acquise',
};

export const ACQUISITION_STATUS_BADGE: Record<AcquisitionStatusValue, BadgeVariant> = {
  SUBMITTED: 'new',
  DEPT_APPROVED: 'primary',
  DEPT_REJECTED: 'danger',
  LIBRARY_ACCEPTED: 'primary',
  LIBRARY_REJECTED: 'danger',
  ACQUIRED: 'success',
};

export const ACQUISITION_STATUSES = Object.keys(ACQUISITION_STATUS_LABELS) as AcquisitionStatusValue[];
