import type { ReactElement } from 'react';
import { getPopularCatalogueBooks } from '@/lib/catalogue-data';
import { BookCard } from '@/components/shared/BookCard';
import { EmptyState } from '@/components/catalogue/EmptyState';
import { Pagination } from '@/components/shared/Pagination';
import { Container } from '@/components/ui/Container';

export const dynamic = 'force-dynamic';

interface PopulairesPageProps {
  searchParams: Promise<{ page?: string }>;
}

function parsePage(rawPage: string | undefined): number {
  const parsed = Number.parseInt(rawPage ?? '1', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function PopulairesPage({ searchParams }: PopulairesPageProps): Promise<ReactElement> {
  const { page: rawPage } = await searchParams;
  const page = parsePage(rawPage);

  const { data: books, pagination } = await getPopularCatalogueBooks(page, 12);

  return (
    <div className="bg-accent">
      <div className="border-b border-slate-200 bg-primary py-16 text-white">
        <Container>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-secondary">Tendances</p>
          <h1 className="mt-2 font-serif text-4xl font-semibold">Les plus empruntés</h1>
          <p className="mt-2 max-w-2xl text-slate-200">Les ouvrages préférés de nos lecteurs.</p>
        </Container>
      </div>

      <Container className="flex flex-col gap-8 py-10">
        {books.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <p className="text-sm text-slate-500">
              {pagination.total} ouvrage{pagination.total > 1 ? 's' : ''}
            </p>
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
              {books.map((book) => (
                <BookCard key={book.id} book={book} emphasis="popular" />
              ))}
            </div>
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              buildHref={(page) => (page > 1 ? `/populaires?page=${page}` : '/populaires')}
            />
          </>
        )}
      </Container>
    </div>
  );
}
