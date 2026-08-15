import { prisma } from '@/lib/prisma';
import { bookSelect } from '@/lib/books';

export interface HomeStats {
  totalBooks: number;
  totalStudents: number;
  totalTeachers: number;
  totalLoans: number;
  totalDepartments: number;
}

export async function getHomeStats(): Promise<HomeStats> {
  const [totalBooks, totalStudents, totalTeachers, totalLoans, departments] = await prisma.$transaction([
    prisma.book.count(),
    prisma.user.count({ where: { role: 'STUDENT' } }),
    prisma.user.count({ where: { role: 'TEACHER' } }),
    prisma.loan.count(),
    prisma.book.groupBy({ by: ['department'], orderBy: { department: 'asc' } }),
  ]);

  return { totalBooks, totalStudents, totalTeachers, totalLoans, totalDepartments: departments.length };
}

export function getNewBooks(limit: number) {
  return prisma.book.findMany({
    where: { isNew: true },
    select: bookSelect,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export function getPopularBooks(limit: number) {
  return prisma.book.findMany({
    where: { loanCount: { gt: 0 } },
    select: bookSelect,
    orderBy: { loanCount: 'desc' },
    take: limit,
  });
}

export function getLatestNews(limit: number) {
  return prisma.news.findMany({
    where: { isPublished: true },
    orderBy: { publishedAt: 'desc' },
    take: limit,
  });
}
