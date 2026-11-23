import Link from 'next/link';
import { BookOpen, Search } from 'lucide-react';
import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/shared/Pagination';
import { requireActiveDashboardUser } from '@/lib/dashboard-access';
import { listPublishedReadingLists } from '@/lib/reading-lists';
import { buildListHref } from '@/lib/list-url';
import { formatDate } from '@/lib/utils';
import { readingListsQuerySchema } from '@/schemas/reading-list';
import { flattenSearchParams } from '@/schemas/staff';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Listes de lectures - Gest Biblio' };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const selectClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

export default async function ReadingListsPage({ searchParams }: PageProps): Promise<ReactElement> {
  // Membres connectés et actifs seulement (garde relu en base).
  await requireActiveDashboardUser();

  const query = readingListsQuerySchema.parse(flattenSearchParams(await searchParams));
  const { lists, total, page, totalPages, departments, programs } = await listPublishedReadingLists(query);
  const filters = { q: query.q, departement: query.departement, programme: query.programme };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-primary">Listes de lectures</h1>
        <p className="mt-1 text-sm text-slate-500">Les ouvrages conseillés par les enseignants, cours par cours.</p>
      </div>

      <form method="get" className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label htmlFor="rl-q" className="mb-1 block text-xs font-medium text-slate-600">
            Titre ou code de cours
          </label>
          <input id="rl-q" name="q" defaultValue={query.q ?? ''} maxLength={100} className={selectClass} />
        </div>
        <div>
          <label htmlFor="rl-dept" className="mb-1 block text-xs font-medium text-slate-600">
            Département
          </label>
          <select id="rl-dept" name="departement" defaultValue={query.departement ?? ''} className={selectClass}>
            <option value="">Tous</option>
            {departments.map((department) => (
              <option key={department.id} value={department.slug}>
                {department.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="rl-prog" className="mb-1 block text-xs font-medium text-slate-600">
            Programme
          </label>
          <select id="rl-prog" name="programme" defaultValue={query.programme ?? ''} className={selectClass} disabled={programs.length === 0}>
            <option value="">{programs.length === 0 ? 'Choisir un département' : 'Tous'}</option>
            {programs.map((program) => (
              <option key={program.id} value={program.slug}>
                {program.name}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-4">
          <Button type="submit" size="sm" variant="outline">
            <Search className="h-4 w-4" aria-hidden="true" />
            Filtrer
          </Button>
        </div>
      </form>

      <p className="text-sm text-slate-500">
        {total} liste{total > 1 ? 's' : ''} publiée{total > 1 ? 's' : ''}
      </p>

      {lists.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-16 text-center">
          <BookOpen className="h-8 w-8 text-primary" aria-hidden="true" />
          <p className="font-serif text-lg font-semibold text-primary">Aucune liste ne correspond à ces critères.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {lists.map((list) => (
            <li key={list.id}>
              <Link href={`/listes-de-lecture/${list.id}`} className="flex h-full flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-md">
                <p className="font-medium text-primary">{list.title}</p>
                <p className="text-sm text-slate-600">
                  {[list.courseCode, list.department.name, list.program?.name].filter(Boolean).join(' · ')}
                </p>
                <p className="mt-auto text-xs text-slate-500">
                  {list.itemCount} ouvrage{list.itemCount > 1 ? 's' : ''}
                  {list.academicYear ? ` · ${list.academicYear}` : ''} · mise à jour le {formatDate(list.updatedAt)}
                  {list.teacherName ? ` · ${list.teacherName}` : ''}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Pagination page={page} totalPages={totalPages} total={total} buildHref={(target) => buildListHref('/listes-de-lecture', { ...filters, page: target })} />
    </div>
  );
}
