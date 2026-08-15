import type { ReactElement } from 'react';
import { searchBooksSchema } from '@/schemas/book';
import { searchCatalogueBooks, getCatalogueMetadata } from '@/lib/catalogue-data';
import { buildCatalogueHref, type CatalogueFilterValues } from '@/lib/catalogue-url';
import { SearchBar } from '@/components/catalogue/SearchBar';
import { FilterChips } from '@/components/catalogue/FilterChips';
import { ActiveFilters } from '@/components/catalogue/ActiveFilters';
import { BookGrid } from '@/components/catalogue/BookGrid';
import { Pagination } from '@/components/shared/Pagination';
import { EmptyState } from '@/components/catalogue/EmptyState';
import { Container } from '@/components/ui/Container';

export const dynamic = 'force-dynamic';

interface CataloguePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CataloguePage({ searchParams }: CataloguePageProps): Promise<ReactElement> {
  const rawParams = await searchParams;
  const normalized = Object.fromEntries(
    Object.entries(rawParams).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])
  );

  const parsed = searchBooksSchema.safeParse(normalized);
  const filters = parsed.success ? parsed.data : searchBooksSchema.parse({});

  const [{ data: books, pagination }, metadata] = await Promise.all([
    searchCatalogueBooks(filters),
    getCatalogueMetadata(),
  ]);

  const currentFilters: CatalogueFilterValues = {
    query: filters.query,
    department: filters.department,
    category: filters.category,
    year: filters.year,
    availability: filters.availability,
    page: filters.page,
  };

  return (
    <div className="bg-accent">
      <div className="border-b border-slate-200 bg-primary py-16 text-white">
        <Container className="flex flex-col gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-secondary">Bibliothèque</p>
            <h1 className="mt-2 font-serif text-4xl font-semibold">Catalogue</h1>
            <p className="mt-2 max-w-2xl text-slate-200">
              Parcourez l&rsquo;ensemble de notre collection et trouvez l&rsquo;ouvrage qu&rsquo;il vous faut.
            </p>
          </div>
          <SearchBar defaultQuery={filters.query ?? ''} currentFilters={currentFilters} />
        </Container>
      </div>

      <Container className="flex flex-col gap-8 py-10">
        <FilterChips metadata={metadata} currentFilters={currentFilters} />
        <ActiveFilters currentFilters={currentFilters} />

        {books.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <p className="text-sm text-slate-500">
              {pagination.total} ouvrage{pagination.total > 1 ? 's' : ''} trouvé{pagination.total > 1 ? 's' : ''}
            </p>
            <BookGrid books={books} />
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              buildHref={(page) => buildCatalogueHref(currentFilters, { page })}
            />
          </>
        )}
      </Container>
    </div>
  );
}
