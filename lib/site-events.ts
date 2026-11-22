import type { Prisma } from '@prisma/client';

/**
 * Boîte d'envoi : les demandes des utilisateurs, lues puis acquittées par le
 * logiciel de gestion. Charges limitées aux matricules, identifiants et dates :
 * jamais de nom, d'email ni de mot de passe.
 */
export interface SiteEventPayloads {
  'reservation.created': { reservationId: string; matricule: string | null; bookExternalId: string; requestedAt: string };
  'reservation.cancelled': { reservationId: string; matricule: string | null; bookExternalId: string; cancelledAt: string };
  'loan.renewal_requested': {
    loanExternalId: string;
    matricule: string | null;
    bookExternalId: string;
    requestedAt: string;
    currentDueDate: string;
    /** État courant du prêt, pour qu'un client puisse répondre par un loans/sync complet. */
    borrowDate: string;
    renewalCount: number;
    fineAmount: number | null;
  };
}

export type SiteEventType = keyof SiteEventPayloads;

/** Clé arbitraire et constante du verrou d'écriture de la boîte d'envoi. */
const SITE_EVENT_LOCK_KEY = 782431905;

/**
 * Écrit un événement DANS la transaction de l'action utilisateur : les deux
 * sont validés ou annulés ensemble. À appeler en dernier dans la transaction.
 *
 * Le verrou transactionnel sérialise les écrivains jusqu'au COMMIT : l'ordre des
 * seq est ainsi l'ordre de validation. Sans lui, une transaction ayant obtenu
 * seq=5 pourrait valider après celle ayant seq=6, et un lecteur déjà passé à
 * after=6 ne verrait jamais l'événement 5.
 */
export async function recordSiteEvent<T extends SiteEventType>(
  tx: Prisma.TransactionClient,
  type: T,
  payload: SiteEventPayloads[T]
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SITE_EVENT_LOCK_KEY}::bigint)`;
  await tx.siteEvent.create({ data: { type, payload: payload as unknown as Prisma.InputJsonValue } });
}
