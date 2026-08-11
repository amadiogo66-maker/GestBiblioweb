import { LoanStatus, UserStatus } from '@prisma/client';
import { NextResponse, type NextRequest } from 'next/server';
import { getAuthenticatedUser, jsonResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { createRenewedDueDate, isRenewableLoan, loanSelect } from '@/lib/circulation';

export const runtime = 'nodejs';

interface RenewLoanRouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function PATCH(request: NextRequest, context: RenewLoanRouteContext): Promise<NextResponse> {
  try {
    const user = await getAuthenticatedUser();

    if (!user || user.status !== UserStatus.ACTIVE) {
      return jsonResponse({ success: false, message: 'Non authentifié' }, 401);
    }

    const { id } = await context.params;
    const loan = await prisma.loan.findFirst({
      where: {
        id,
        userId: user.id,
        status: LoanStatus.ACTIVE,
      },
      select: {
        id: true,
        dueDate: true,
        renewalCount: true,
        status: true,
      },
    });

    if (!loan) {
      return jsonResponse({ success: false, message: 'Emprunt introuvable' }, 404);
    }

    if (!isRenewableLoan(loan)) {
      return jsonResponse({ success: false, message: 'Cet emprunt ne peut pas être renouvelé' }, 409);
    }

    const renewedLoan = await prisma.loan.update({
      where: { id: loan.id },
      data: {
        dueDate: createRenewedDueDate(loan.dueDate),
        renewalCount: { increment: 1 },
      },
      select: loanSelect,
    });

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: 'loan.renew',
        ipAddress: request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent'),
        details: { loanId: renewedLoan.id, bookId: renewedLoan.bookId },
      },
    });

    return jsonResponse({ success: true, message: 'Emprunt renouvelé', data: renewedLoan });
  } catch (error) {
    logger.error('Loan renewal failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de renouveler l’emprunt' }, 500);
  }
}

