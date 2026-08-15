import { NextResponse } from 'next/server';
import { jsonResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  try {
    const [totalBooks, totalStudents, totalTeachers, totalLoans, departments] = await prisma.$transaction([
      prisma.book.count(),
      prisma.user.count({ where: { role: 'STUDENT' } }),
      prisma.user.count({ where: { role: 'TEACHER' } }),
      prisma.loan.count(),
      prisma.book.groupBy({ by: ['department'], orderBy: { department: 'asc' } }),
    ]);

    return jsonResponse({
      success: true,
      data: {
        totalBooks,
        totalStudents,
        totalTeachers,
        totalLoans,
        totalDepartments: departments.length,
      },
    });
  } catch (error) {
    logger.error('Stats fetch failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de récupérer les statistiques' }, 500);
  }
}
