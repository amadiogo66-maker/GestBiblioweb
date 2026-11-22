import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { LoanStatus, ReservationStatus } from '@prisma/client';
import type { ReactElement } from 'react';
import { prisma } from '@/lib/prisma';
import { bookSelect } from '@/lib/books';
import { auth } from '@/lib/auth';
import { Container } from '@/components/ui/Container';
import { BookDetail } from '@/components/ouvrage/BookDetail';
import { BookMetadata } from '@/components/ouvrage/BookMetadata';
import { AvailabilityBadge } from '@/components/ouvrage/AvailabilityBadge';
import { BookActions } from '@/components/ouvrage/BookActions';
import { SimilarBooks } from '@/components/ouvrage/SimilarBooks';
import { EmptyState } from '@/components/ouvrage/EmptyState';
import { CirculationNotice } from '@/components/shared/CirculationNotice';
import { isCirculationReachable } from '@/lib/circulation-status';

export const dynamic = 'force-dynamic';

interface OuvragePageProps {
  params: Promise<{ id: string }>;
}

export default async function OuvragePage({ params }: OuvragePageProps): Promise<ReactElement> {
  const { id } = await params;

  const book = await prisma.book.findUnique({ where: { id }, select: bookSelect });

  if (!book) {
    return <EmptyState />;
  }

  const session = await auth();

  let loanDueDate: Date | null = null;
  let reservationStatus: ReservationStatus | null = null;

  if (session?.user?.id) {
    const [loan, reservation] = await Promise.all([
      prisma.loan.findFirst({
        where: { userId: session.user.id, bookId: book.id, status: LoanStatus.ACTIVE },
        select: { dueDate: true },
      }),
      prisma.reservation.findFirst({
        where: {
          userId: session.user.id,
          bookId: book.id,
          status: { in: [ReservationStatus.PENDING, ReservationStatus.READY] },
        },
        select: { status: true },
      }),
    ]);

    loanDueDate = loan?.dueDate ?? null;
    reservationStatus = reservation?.status ?? null;
  }

  const reachable = await isCirculationReachable();
  const similarBooks = await prisma.book.findMany({
    where: { category: book.category, id: { not: book.id } },
    select: bookSelect,
    take: 4,
    orderBy: { loanCount: 'desc' },
  });

  return (
    <div className="bg-white">
      <Container className="flex flex-col gap-10 py-12">
        <Link
          href="/catalogue"
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Retour au catalogue
        </Link>

        <BookDetail book={book} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <AvailabilityBadge
              availableCopies={book.availableCopies}
              totalCopies={book.totalCopies}
              status={book.status}
            />
            {reachable ? null : <CirculationNotice />}
            <BookActions
              bookId={book.id}
              availableCopies={book.availableCopies}
              initialReservationStatus={reservationStatus}
              initialLoanDueDate={loanDueDate ? loanDueDate.toISOString() : null}
            />
          </div>
          <BookMetadata book={book} />
        </div>
      </Container>

      <SimilarBooks books={similarBooks} />
    </div>
  );
}
