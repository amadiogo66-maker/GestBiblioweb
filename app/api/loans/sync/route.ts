import { NextResponse, type NextRequest } from 'next/server';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { rejectInvalidApiKey } from '@/lib/api-key';
import { logActivity } from '@/lib/activity-log';
import { resolveRenewalState } from '@/lib/circulation';
import { recordCirculationContact } from '@/lib/circulation-status';
import { logger } from '@/lib/logger';
import { createNotification, notificationTexts } from '@/lib/notifications';
import { prisma } from '@/lib/prisma';
import { loanSyncItemSchema, loansSyncSchema } from '@/schemas/circulation-sync';
import { BODY_LIMITS } from '@/lib/constants';
import { payloadTooLargeResponse, readJsonBodyOrNull } from '@/lib/json-body';

export const runtime = 'nodejs';

interface RejectedLoan {
  index: number;
  externalId?: string;
  reason: string;
}

interface LoanWarning {
  index: number;
  externalId: string;
  bookExternalId: string;
  message: string;
}

class LoanItemRejected extends Error {}

function extractExternalId(raw: unknown): string | undefined {
  const value = raw && typeof raw === 'object' ? (raw as { externalId?: unknown }).externalId : undefined;
  return typeof value === 'string' ? value : undefined;
}

/**
 * Prêts et retours envoyés par le logiciel de gestion, qui fait foi.
 * Upsert idempotent par externalId, transaction par élément, jamais de
 * suppression. Book.status et Book.loanCount ne sont pas modifiés.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rejectedKey = rejectInvalidApiKey(request);

  if (rejectedKey) {
    return rejectedKey;
  }

  await recordCirculationContact();

  try {
    const parsed = loansSyncSchema.safeParse(await readJsonBodyOrNull(request, BODY_LIMITS.sync));

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const items = parsed.data.loans.map((raw) => ({ raw, result: loanSyncItemSchema.safeParse(raw) }));
    const valid = items.flatMap((item) => (item.result.success ? [item.result.data] : []));
    const matricules = [...new Set(valid.map((loan) => loan.matricule))];
    const bookExternalIds = [...new Set(valid.map((loan) => loan.bookExternalId))];

    // Référentiels chargés une fois pour tout le lot.
    const [members, users, books] = await Promise.all([
      prisma.libraryMember.findMany({ where: { matricule: { in: matricules } }, select: { matricule: true } }),
      prisma.user.findMany({ where: { matricule: { in: matricules } }, select: { id: true, matricule: true } }),
      prisma.book.findMany({
        where: { externalId: { in: bookExternalIds } },
        select: { id: true, externalId: true, title: true, totalCopies: true },
      }),
    ]);
    const knownMembers = new Set(members.map((member) => member.matricule));
    const userIdByMatricule = new Map(users.map((user) => [user.matricule, user.id]));
    const bookByExternalId = new Map(books.map((book) => [book.externalId, book]));

    let created = 0;
    let updated = 0;
    let linked = 0;
    let unlinked = 0;
    const warnings: LoanWarning[] = [];
    const rejectedDetails: RejectedLoan[] = [];

    for (const [index, { raw, result }] of items.entries()) {
      if (!result.success) {
        rejectedDetails.push({
          index,
          externalId: extractExternalId(raw),
          reason: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
        });
        continue;
      }

      const loan = result.data;
      const book = bookByExternalId.get(loan.bookExternalId);

      if (!knownMembers.has(loan.matricule)) {
        rejectedDetails.push({ index, externalId: loan.externalId, reason: 'Membre inconnu' });
        continue;
      }

      if (!book) {
        rejectedDetails.push({ index, externalId: loan.externalId, reason: 'Livre inconnu' });
        continue;
      }

      const userId = userIdByMatricule.get(loan.matricule) ?? null;

      try {
        const wasExisting = await prisma.$transaction(async (tx) => {
          const existing = await tx.loan.findUnique({
            where: { externalId: loan.externalId },
            select: { dueDate: true, renewalCount: true, renewalRequestedAt: true, renewalRefusedAt: true },
          });
          const renewal = resolveRenewalState(existing, loan);

          if (renewal.conflict) {
            throw new LoanItemRejected('renewalDecision REFUSED incompatible avec une échéance ou un renewalCount modifié');
          }

          const data = {
            userId,
            matricule: loan.matricule,
            bookId: book.id,
            borrowDate: loan.borrowDate,
            dueDate: loan.dueDate,
            returnDate: loan.returnDate,
            status: loan.status,
            renewalCount: loan.renewalCount,
            fineAmount: loan.fineAmount,
            renewalRequestedAt: renewal.renewalRequestedAt,
            renewalRefusedAt: renewal.renewalRefusedAt,
          };

          await tx.loan.upsert({
            where: { externalId: loan.externalId },
            create: { externalId: loan.externalId, ...data },
            update: data,
          });

          if (loan.availableCopies !== undefined) {
            // Valeur absolue ; aucune écriture (ni updatedAt) si elle est déjà en place.
            await tx.book.updateMany({
              where: { id: book.id, availableCopies: { not: loan.availableCopies } },
              data: { availableCopies: loan.availableCopies },
            });
          }

          if (userId && renewal.outcome === 'granted') {
            await createNotification(tx, {
              ...notificationTexts.renewalGranted(book.title, loan.dueDate),
              userId,
              dedupeKey: `loan:${loan.externalId}:renewal-granted:${loan.dueDate.toISOString()}`,
              source: 'site',
            });
          }

          if (userId && renewal.outcome === 'refused') {
            await createNotification(tx, {
              ...notificationTexts.renewalRefused(book.title),
              userId,
              dedupeKey: `loan:${loan.externalId}:renewal-refused:${loan.dueDate.toISOString()}`,
              source: 'site',
            });
          }

          return existing !== null;
        });

        if (wasExisting) {
          updated += 1;
        } else {
          created += 1;
        }
        if (userId) {
          linked += 1;
        } else {
          unlinked += 1;
        }
        if (loan.availableCopies !== undefined && loan.availableCopies > book.totalCopies) {
          warnings.push({
            index,
            externalId: loan.externalId,
            bookExternalId: loan.bookExternalId,
            message: `availableCopies (${loan.availableCopies}) dépasse totalCopies (${book.totalCopies})`,
          });
        }
      } catch (error) {
        if (error instanceof LoanItemRejected) {
          rejectedDetails.push({ index, externalId: loan.externalId, reason: error.message });
          continue;
        }

        logger.error('Loan upsert failed', { index, error: error instanceof Error ? error.message : 'unknown error' });
        rejectedDetails.push({ index, externalId: loan.externalId, reason: 'Erreur interne lors de l’enregistrement' });
      }
    }

    const rejected = rejectedDetails.length;

    await logActivity({ action: 'loans.sync', details: { created, updated, rejected, linked, unlinked, warnings: warnings.length } });

    return jsonResponse({
      success: true,
      message: `${created} création(s), ${updated} mise(s) à jour, ${rejected} rejet(s)`,
      data: { created, updated, rejected, linked, unlinked, warnings, rejectedDetails },
    });
  } catch (error) {
    const tooLarge = payloadTooLargeResponse(error);

    if (tooLarge) {
      return tooLarge;
    }

    logger.error('Loans sync failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de synchroniser les prêts' }, 500);
  }
}
