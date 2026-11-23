import { LoanStatus } from '@prisma/client';
import { NextResponse, type NextRequest } from 'next/server';
import { jsonResponse } from '@/lib/api';
import { rejectCrossOrigin, requireActiveUser } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { isRenewableLoan, loanSelect } from '@/lib/circulation';
import { recordSiteEvent } from '@/lib/site-events';
import { getClientIp } from '@/lib/client-ip';

export const runtime = 'nodejs';

const ALREADY_REQUESTED_MESSAGE = 'Une demande de renouvellement est déjà en attente';
const REFUSED_MESSAGE = 'Ce renouvellement a été refusé, rapprochez-vous du guichet';

interface RenewLoanRouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function PATCH(request: NextRequest, context: RenewLoanRouteContext): Promise<NextResponse> {
  const crossOrigin = rejectCrossOrigin(request);

  if (crossOrigin) {
    return crossOrigin;
  }

  try {
    const authz = await requireActiveUser();

    if (!authz.ok) {
      return authz.response;
    }

    const { user } = authz;

    const { id } = await context.params;
    const loan = await prisma.loan.findFirst({
      where: {
        id,
        userId: user.id,
        status: LoanStatus.ACTIVE,
      },
      select: {
        id: true,
        externalId: true,
        matricule: true,
        dueDate: true,
        renewalCount: true,
        renewalRequestedAt: true,
        renewalRefusedAt: true,
        status: true,
        book: { select: { externalId: true } },
      },
    });

    if (!loan) {
      return jsonResponse({ success: false, message: 'Emprunt introuvable' }, 404);
    }

    if (!isRenewableLoan(loan)) {
      return jsonResponse({ success: false, message: 'Cet emprunt ne peut pas être renouvelé' }, 409);
    }

    const loanExternalId = loan.externalId;

    if (!loanExternalId) {
      return jsonResponse(
        { success: false, message: 'Cet emprunt n’est pas enregistré dans le logiciel de la bibliothèque : adressez-vous au guichet.' },
        409
      );
    }

    if (loan.renewalRefusedAt) {
      return jsonResponse({ success: false, message: REFUSED_MESSAGE }, 409);
    }

    if (loan.renewalRequestedAt) {
      return jsonResponse({ success: false, message: ALREADY_REQUESTED_MESSAGE }, 409);
    }

    // Une DEMANDE seulement : dueDate et renewalCount restent décidés par le logiciel.
    const requestedLoan = await prisma.$transaction(async (tx) => {
      const requestedAt = new Date();
      const { count } = await tx.loan.updateMany({
        where: { id: loan.id, userId: user.id, status: LoanStatus.ACTIVE, renewalRequestedAt: null, renewalRefusedAt: null },
        data: { renewalRequestedAt: requestedAt },
      });

      if (count !== 1) {
        return null;
      }

      const updated = await tx.loan.findUniqueOrThrow({ where: { id: loan.id }, select: loanSelect });

      await tx.activityLog.create({
        data: {
          userId: user.id,
          action: 'loan.renewal_requested',
          ipAddress: getClientIp(request.headers),
          userAgent: request.headers.get('user-agent'),
          details: { loanId: updated.id, bookId: updated.bookId },
        },
      });

      await recordSiteEvent(tx, 'loan.renewal_requested', {
        loanExternalId,
        matricule: loan.matricule ?? user.matricule,
        bookExternalId: loan.book.externalId,
        requestedAt: requestedAt.toISOString(),
        currentDueDate: updated.dueDate.toISOString(),
        borrowDate: updated.borrowDate.toISOString(),
        renewalCount: updated.renewalCount,
        fineAmount: updated.fineAmount === null ? null : Number(updated.fineAmount),
      });

      return updated;
    });

    if (!requestedLoan) {
      return jsonResponse({ success: false, message: ALREADY_REQUESTED_MESSAGE }, 409);
    }

    return jsonResponse({
      success: true,
      message: 'Demande de renouvellement envoyée, le bibliothécaire la traitera au guichet',
      data: requestedLoan,
    });
  } catch (error) {
    logger.error('Loan renewal request failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible d’envoyer la demande de renouvellement' }, 500);
  }
}

