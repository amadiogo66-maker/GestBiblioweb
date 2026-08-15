import type { ReactElement } from 'react';
import { searchBooksSchema } from '@/schemas/book';
import { searchCatalogueBooks } from '@/lib/catalogue-data';
import { BookGrid } from '@/components/catalogue/BookGrid';
import { EmptyState } from '@/components/catalogue/EmptyState';
import { Pagination } from '@/components/shared/Pagination';
import { Container } from '@/components/ui/Container';

export const dynamic = 'force-dynamic';

interface NouveautesPageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function NouveautesPage({ searchParams }: NouveautesPageProps): Promise<ReactElement> {
  const { page: rawPage } = await searchParams;
  const filters = searchBooksSchema.parse({
    isNew: true,
    page: rawPage,
    limit: 12,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  const { data: books, pagination } = await searchCatalogueBooks(filters);

  return (
    <div className="bg-accent">
      <div className="border-b border-slate-200 bg-primary py-16 text-white">
        <Container>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-secondary">Collection</p>
          <h1 className="mt-2 font-serif text-4xl font-semibold">Nouveautés</h1>
          <p className="mt-2 max-w-2xl text-slate-200">Les derniers ouvrages ajoutés à notre collection.</p>
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
            <BookGrid books={books} />
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              buildHref={(page) => (page > 1 ? `/nouveautes?page=${page}` : '/nouveautes')}
            />
          </>
        )}
      </Container>
    </div>
  );
}
