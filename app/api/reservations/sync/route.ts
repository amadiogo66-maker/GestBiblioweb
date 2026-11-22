import { NextResponse, type NextRequest } from 'next/server';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { rejectInvalidApiKey } from '@/lib/api-key';
import { logActivity } from '@/lib/activity-log';
import { evaluateReservationTransition } from '@/lib/circulation';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { reservationSyncItemSchema, reservationsSyncSchema } from '@/schemas/circulation-sync';

export const runtime = 'nodejs';

interface RejectedUpdate {
  index: number;
  reservationId?: string;
  reason: string;
}

function extractReservationId(raw: unknown): string | undefined {
  const value = raw && typeof raw === 'object' ? (raw as { reservationId?: unknown }).reservationId : undefined;
  return typeof value === 'string' ? value : undefined;
}

/** État réel des réservations, décidé par le logiciel de gestion. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rejectedKey = rejectInvalidApiKey(request);

  if (rejectedKey) {
    return rejectedKey;
  }

  try {
    const parsed = reservationsSyncSchema.safeParse(await request.json().catch(() => null));

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    let updated = 0;
    let unchanged = 0;
    const rejectedDetails: RejectedUpdate[] = [];

    for (const [index, raw] of parsed.data.updates.entries()) {
      const item = reservationSyncItemSchema.safeParse(raw);

      if (!item.success) {
        rejectedDetails.push({
          index,
          reservationId: extractReservationId(raw),
          reason: item.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
        });
        continue;
      }

      const { reservationId, status, expiryDate } = item.data;

      try {
        const current = await prisma.reservation.findUnique({ where: { id: reservationId }, select: { status: true } });

        if (!current) {
          rejectedDetails.push({ index, reservationId, reason: 'Réservation inconnue' });
          continue;
        }

        const transition = evaluateReservationTransition(current.status, status);

        if (transition === 'unchanged') {
          unchanged += 1;
          continue;
        }

        if (transition === 'forbidden') {
          rejectedDetails.push({ index, reservationId, reason: `Transition interdite : ${current.status} vers ${status}` });
          continue;
        }

        // Conditionnelle : une annulation simultanée de l'utilisateur n'est jamais écrasée.
        const { count } = await prisma.reservation.updateMany({
          where: { id: reservationId, status: current.status },
          data: { status, ...(expiryDate ? { expiryDate } : {}) },
        });

        if (count === 1) {
          updated += 1;
        } else {
          rejectedDetails.push({ index, reservationId, reason: 'Statut modifié entre-temps : rejouer cet élément' });
        }
      } catch (error) {
        logger.error('Reservation sync item failed', { index, error: error instanceof Error ? error.message : 'unknown error' });
        rejectedDetails.push({ index, reservationId, reason: 'Erreur interne lors de l’enregistrement' });
      }
    }

    const rejected = rejectedDetails.length;

    await logActivity({ action: 'reservations.sync', details: { updated, unchanged, rejected } });

    return jsonResponse({
      success: true,
      message: `${updated} mise(s) à jour, ${unchanged} sans effet, ${rejected} rejet(s)`,
      data: { updated, unchanged, rejected, rejectedDetails },
    });
  } catch (error) {
    logger.error('Reservations sync failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de synchroniser les réservations' }, 500);
  }
}
