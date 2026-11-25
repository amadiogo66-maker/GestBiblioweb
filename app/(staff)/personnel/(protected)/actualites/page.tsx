import Link from 'next/link';
import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import type { Prisma } from '@prisma/client';
import type { ReactElement } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/shared/Pagination';
import { requireStaffPage } from '@/lib/staff-page';
import { prisma } from '@/lib/prisma';
import { buildListHref } from '@/lib/list-url';
import { NEWS_CATEGORIES, NEWS_CATEGORY_LABELS } from '@/lib/news-data';
import { STAFF_NEWS_PAGE_SIZE } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import { flattenSearchParams } from '@/schemas/staff';
import { staffNewsQuerySchema } from '@/schemas/news';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Actualités - Gest Biblio' };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const FIELD_CLASS =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

export default async function StaffNewsPage({ searchParams }: PageProps): Promise<ReactElement> {
  await requireStaffPage('ADMIN', 'LIBRARIAN');

  const query = staffNewsQuerySchema.parse(flattenSearchParams(await searchParams));
  const where: Prisma.NewsWhereInput = {
    ...(query.origine ? { source: query.origine === 'site' ? 'SITE' : 'SOFTWARE' } : {}),
    ...(query.etat ? { isPublished: query.etat === 'publiee' } : {}),
    ...(query.categorie ? { category: query.categorie } : {}),
  };
  const total = await prisma.news.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / STAFF_NEWS_PAGE_SIZE));
  const page = Math.min(query.page, totalPages);
  const rows = await prisma.news.findMany({
    where,
    // Brouillons jamais publiés (sans date) en premier, puis les plus récentes.
    orderBy: [{ publishedAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }, { id: 'asc' }],
    skip: (page - 1) * STAFF_NEWS_PAGE_SIZE,
    take: STAFF_NEWS_PAGE_SIZE,
    select: { id: true, title: true, category: true, source: true, isPublished: true, publishedAt: true, createdAt: true },
  });
  const filters = { origine: query.origine, etat: query.etat, categorie: query.categorie };

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-primary">Actualités</h1>
          <p className="mt-1 text-sm text-slate-500">
            {total} actualité{total > 1 ? 's' : ''}. Celles du logiciel de gestion sont en lecture seule.
          </p>
        </div>
        <Button href="/personnel/actualites/nouvelle" size="sm">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nouvelle actualité
        </Button>
      </div>

      <form method="get" action="/personnel/actualites" className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Origine
          <select name="origine" defaultValue={query.origine ?? ''} className={FIELD_CLASS}>
            <option value="">Toutes</option>
            <option value="site">Site</option>
            <option value="logiciel">Logiciel de gestion</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          État
          <select name="etat" defaultValue={query.etat ?? ''} className={FIELD_CLASS}>
            <option value="">Tous</option>
            <option value="publiee">Publiée</option>
            <option value="brouillon">Brouillon ou dépubliée</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Catégorie
          <select name="categorie" defaultValue={query.categorie ?? ''} className={FIELD_CLASS}>
            <option value="">Toutes</option>
            {NEWS_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {NEWS_CATEGORY_LABELS[category] ?? category}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <Button type="submit" size="sm" variant="outline">
            Filtrer
          </Button>
        </div>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">Aucune actualité.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {rows.map((news) => (
            <li key={news.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <Link href={`/personnel/actualites/${news.id}`} className="break-words font-medium text-primary hover:underline">
                  {news.title}
                </Link>
                <p className="text-xs text-slate-500">
                  {NEWS_CATEGORY_LABELS[news.category] ?? news.category} ·{' '}
                  {news.publishedAt ? `publiée le ${formatDate(news.publishedAt)}` : `brouillon créé le ${formatDate(news.createdAt)}`}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {news.source === 'SOFTWARE' ? <Badge variant="neutral">Géré dans le logiciel</Badge> : <Badge variant="primary">Site</Badge>}
                <Badge variant={news.isPublished ? 'success' : 'neutral'}>{news.isPublished ? 'Publiée' : news.publishedAt ? 'Dépubliée' : 'Brouillon'}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Pagination page={page} totalPages={totalPages} total={total} buildHref={(target) => buildListHref('/personnel/actualites', { ...filters, page: target })} />
    </>
  );
}
