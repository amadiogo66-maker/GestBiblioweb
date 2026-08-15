import type { ReactElement } from 'react';
import { NewsCategory } from '@prisma/client';
import { searchNews } from '@/lib/news-data';
import { NewsCard } from '@/components/shared/NewsCard';
import { CategoryFilter } from '@/components/actualites/CategoryFilter';
import { EmptyState } from '@/components/actualites/EmptyState';
import { Pagination } from '@/components/shared/Pagination';
import { Container } from '@/components/ui/Container';

export const dynamic = 'force-dynamic';

interface ActualitesPageProps {
  searchParams: Promise<{ page?: string; category?: string }>;
}

function parsePage(rawPage: string | undefined): number {
  const parsed = Number.parseInt(rawPage ?? '1', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parseCategory(rawCategory: string | undefined): NewsCategory | undefined {
  return rawCategory && rawCategory in NewsCategory ? (rawCategory as NewsCategory) : undefined;
}

export default async function ActualitesPage({ searchParams }: ActualitesPageProps): Promise<ReactElement> {
  const { page: rawPage, category: rawCategory } = await searchParams;
  const page = parsePage(rawPage);
  const category = parseCategory(rawCategory);

  const { data: news, pagination } = await searchNews(page, 9, category);

  return (
    <div className="bg-accent">
      <div className="border-b border-slate-200 bg-primary py-16 text-white">
        <Container>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-secondary">Vie de la bibliothèque</p>
          <h1 className="mt-2 font-serif text-4xl font-semibold">Actualités</h1>
          <p className="mt-2 max-w-2xl text-slate-200">
            Les dernières annonces, événements et nouveautés de la bibliothèque.
          </p>
        </Container>
      </div>

      <Container className="flex flex-col gap-8 py-10">
        <CategoryFilter activeCategory={category} />

        {news.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {news.map((item) => (
                <NewsCard key={item.id} news={item} />
              ))}
            </div>
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              buildHref={(targetPage) => {
                const params = new URLSearchParams();
                if (category) {
                  params.set('category', category);
                }
                if (targetPage > 1) {
                  params.set('page', String(targetPage));
                }
                const queryString = params.toString();
                return queryString ? `/actualites?${queryString}` : '/actualites';
              }}
            />
          </>
        )}
      </Container>
    </div>
  );
}
