import Link from 'next/link';
import { BookOpen, Search } from 'lucide-react';
import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/shared/Pagination';
import { AutoSubmitSelect } from '@/components/shared/AutoSubmitSelect';
import { requireActiveDashboardUser } from '@/lib/dashboard-access';
import { listPublishedReadingLists } from '@/lib/reading-lists';
import { ALL_DEPARTMENTS_FILTER } from '@/lib/constants';
import { buildListHref } from '@/lib/list-url';
import { cn, formatDate } from '@/lib/utils';
import { readingListsQuerySchema } from '@/schemas/reading-list';
import { flattenSearchParams } from '@/schemas/staff';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Listes de lectures - Gest Biblio' };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const selectClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

const scopeLinkClass = (active: boolean): string =>
  cn(
    'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
    active ? 'border-primary bg-primary text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-primary hover:text-primary'
  );

export default async function ReadingListsPage({ searchParams }: PageProps): Promise<ReactElement> {
  // Membres connectés et actifs seulement ; département relu en base par le garde.
  const user = await requireActiveDashboardUser();

  const query = readingListsQuerySchema.parse(flattenSearchParams(await searchParams));
  const { lists, total, page, totalPages, departments, programs, mode, selectedDepartment, myDepartment, selectedProgram } =
    await listPublishedReadingLists(query, user.departmentId);
  // Un programme ignoré (étranger au département, ou avec « Tous ») n'est pas recopié dans les liens.
  const filters = { q: query.q, departement: query.departement, programme: selectedProgram?.slug };
  const programHelp =
    programs.length > 0
      ? null
      : selectedDepartment
        ? 'Aucun programme n’est enregistré pour ce département'
        : 'Choisissez un département pour filtrer par programme';
  // Sans paramètre : département de l'utilisateur ; « Tous » est un choix explicite dans l'URL.
  const selectValue = mode === 'all' ? ALL_DEPARTMENTS_FILTER : (selectedDepartment?.slug ?? query.departement ?? '');
  const allHref = buildListHref('/listes-de-lecture', { q: query.q, departement: ALL_DEPARTMENTS_FILTER });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-primary">Listes de lectures</h1>
        <p className="mt-1 text-sm text-slate-500">Les ouvrages conseillés par les enseignants, cours par cours.</p>
      </div>

      <nav aria-label="Départements affichés" className="flex flex-wrap items-center gap-2">
        {myDepartment ? (
          <Link
            href={buildListHref('/listes-de-lecture', { q: query.q })}
            className={scopeLinkClass(mode === 'mine')}
            aria-current={mode === 'mine' ? 'page' : undefined}
          >
            Mon département
          </Link>
        ) : null}
        <Link href={allHref} className={scopeLinkClass(mode === 'all')} aria-current={mode === 'all' ? 'page' : undefined}>
          Tous les départements
        </Link>
        {mode === 'mine' && myDepartment ? <span className="text-sm text-slate-500">{myDepartment.name}</span> : null}
        {mode === 'explicit' ? <span className="text-sm text-slate-500">{selectedDepartment?.name ?? 'Département inconnu'}</span> : null}
      </nav>

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
          {/* Au changement : rechargement avec les programmes du nouveau département, programme remis à zéro. */}
          <AutoSubmitSelect id="rl-dept" name="departement" defaultValue={selectValue} className={selectClass} resetFields={['programme']}>
            <option value={ALL_DEPARTMENTS_FILTER}>Tous les départements</option>
            {departments.map((department) => (
              <option key={department.id} value={department.slug}>
                {department.name}
                {department.id === myDepartment?.id ? ' (mon département)' : ''}
              </option>
            ))}
          </AutoSubmitSelect>
        </div>
        <div>
          <label htmlFor="rl-prog" className="mb-1 block text-xs font-medium text-slate-600">
            Programme
          </label>
          <select
            id="rl-prog"
            name="programme"
            defaultValue={selectedProgram?.slug ?? ''}
            className={cn(selectClass, 'disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500')}
            disabled={programs.length === 0}
            aria-describedby={programHelp ? 'rl-prog-help' : undefined}
          >
            <option value="">Tous les programmes</option>
            {programs.map((program) => (
              <option key={program.id} value={program.slug}>
                {program.name}
              </option>
            ))}
          </select>
          {programHelp ? (
            <p id="rl-prog-help" className="mt-1 text-xs text-slate-500">
              {programHelp}
            </p>
          ) : null}
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
          {mode === 'mine' ? (
            <Link href={allHref} className="text-sm text-primary underline">
              Voir les listes de tous les départements
            </Link>
          ) : null}
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
