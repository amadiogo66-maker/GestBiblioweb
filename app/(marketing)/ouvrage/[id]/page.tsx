import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { LoanStatus, ReservationStatus } from '@prisma/client';
import type { ReactElement } from 'react';
import { prisma } from '@/lib/prisma';
import { bookSelect } from '@/lib/books';
import { getActiveSessionViewer } from '@/lib/dashboard-access';
import { Container } from '@/components/ui/Container';
import { BookDetail } from '@/components/ouvrage/BookDetail';
import { BookMetadata } from '@/components/ouvrage/BookMetadata';
import { AvailabilityBadge } from '@/components/ouvrage/AvailabilityBadge';
import { BookActions } from '@/components/ouvrage/BookActions';
import { SimilarBooks } from '@/components/ouvrage/SimilarBooks';
import { EmptyState } from '@/components/ouvrage/EmptyState';
import { CirculationNotice } from '@/components/shared/CirculationNotice';
import { isCirculationReachable } from '@/lib/circulation-status';
import { publishedListsForBook, teacherListsForBook } from '@/lib/reading-lists';
import { READING_LIST_QUOTAS } from '@/lib/constants';
import { AddToListForm } from '@/components/teacher/AddToListForm';

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

  // Page publique : seul un compte ACTIF reçoit l'état de son prêt ou de sa réservation.
  const viewer = await getActiveSessionViewer();
  const viewerId = viewer?.id ?? null;

  let loanDueDate: Date | null = null;
  let reservationStatus: ReservationStatus | null = null;
  // Listes de lectures : réservées aux membres connectés actifs, PUBLIÉES seulement.
  let readingLists: Awaited<ReturnType<typeof publishedListsForBook>> = [];
  // Enseignant (rôle relu en base) : ses listes, pour « Ajouter à une de mes listes ». Une requête.
  let teacherLists: Awaited<ReturnType<typeof teacherListsForBook>> = [];

  if (viewerId) {
    const [loan, reservation, lists, ownLists] = await Promise.all([
      prisma.loan.findFirst({
        where: { userId: viewerId, bookId: book.id, status: LoanStatus.ACTIVE },
        select: { dueDate: true },
      }),
      prisma.reservation.findFirst({
        where: {
          userId: viewerId,
          bookId: book.id,
          status: { in: [ReservationStatus.PENDING, ReservationStatus.READY] },
        },
        select: { status: true },
      }),
      publishedListsForBook(book.id),
      viewer?.role === 'TEACHER' ? teacherListsForBook(viewerId, book.id) : Promise.resolve([]),
    ]);

    loanDueDate = loan?.dueDate ?? null;
    reservationStatus = reservation?.status ?? null;
    readingLists = lists;
    teacherLists = ownLists;
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
            {teacherLists.length > 0 ? (
              <div className="rounded-xl border border-slate-200 bg-accent p-4">
                <AddToListForm
                  bookId={book.id}
                  lists={teacherLists.map((list) => ({ id: list.id, title: list.title, hasBook: list.hasBook, full: list.itemCount >= READING_LIST_QUOTAS.itemsPerList }))}
                />
              </div>
            ) : null}
          </div>
          <BookMetadata book={book} />
        </div>

        {readingLists.length > 0 ? (
          <section aria-labelledby="reading-lists-title" className="flex flex-col gap-3">
            <h2 id="reading-lists-title" className="font-serif text-xl font-semibold text-primary">
              Dans les listes de lectures
            </h2>
            <ul className="flex flex-col gap-2">
              {readingLists.map((list) => (
                <li key={list.id}>
                  <Link href={`/listes-de-lecture/${list.id}`} className="text-sm font-medium text-primary hover:underline">
                    {list.title}
                  </Link>
                  <span className="text-sm text-slate-500"> · {[list.courseCode, list.department.name].filter(Boolean).join(' · ')}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </Container>

      <SimilarBooks books={similarBooks} />
    </div>
  );
}
