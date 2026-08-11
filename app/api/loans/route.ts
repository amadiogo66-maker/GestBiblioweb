import { UserStatus } from '@prisma/client';
import { NextResponse, type NextRequest } from 'next/server';
import { listLoansSchema } from '@/schemas/loan';
import { getAuthenticatedUser, jsonResponse, validationErrorResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { loanSelect } from '@/lib/circulation';
import type { PaginatedResponse } from '@/types';

export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getAuthenticatedUser();

    if (!user || user.status !== UserStatus.ACTIVE) {
      return jsonResponse({ success: false, message: 'Non authentifié' }, 401);
    }

    const query = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = listLoansSchema.safeParse(query);

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const { page, limit, status } = parsed.data;
    const where = {
      userId: user.id,
      ...(status ? { status } : {}),
    };
    const skip = (page - 1) * limit;
    const [loans, total] = await prisma.$transaction([
      prisma.loan.findMany({
        where,
        select: loanSelect,
        orderBy: { borrowDate: 'desc' },
        skip,
        take: limit,
      }),
      prisma.loan.count({ where }),
    ]);
    const totalPages = Math.ceil(total / limit);

    return jsonResponse<PaginatedResponse<(typeof loans)[number]>>({
      success: true,
      data: {
        data: loans,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
    });
  } catch (error) {
    logger.error('Loan list failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de récupérer les emprunts' }, 500);
  }
}
