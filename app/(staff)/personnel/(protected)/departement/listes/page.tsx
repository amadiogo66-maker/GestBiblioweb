import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/shared/Pagination';
import { ReasonActionForm } from '@/components/shared/ReasonActionForm';
import { DepartmentSpace } from '@/components/staff/DepartmentSpace';
import { requireDepartmentManagerPage } from '@/lib/staff-page';
import { resolveScopedDepartment } from '@/lib/department-scope';
import { canAccessDepartment } from '@/lib/department-access';
import { buildListHref } from '@/lib/list-url';
import { prisma } from '@/lib/prisma';
import { READING_LISTS_PAGE_SIZE } from '@/lib/constants';
import { READING_LIST_STATUS_BADGE, READING_LIST_STATUS_LABELS } from '@/lib/reading-labels';
import { formatDate } from '@/lib/utils';
import { departmentPageQuerySchema, flattenSearchParams } from '@/schemas/staff';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Listes du département - Gest Biblio' };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Listes du département en lecture seule ; ADMIN et LIBRARIAN peuvent dépublier (motif journalisé). */
export default async function DepartmentListsPage({ searchParams }: PageProps): Promise<ReactElement> {
  const context = await requireDepartmentManagerPage();

  const query = departmentPageQuerySchema.parse(flattenSearchParams(await searchParams));
  const { selected, options } = await resolveScopedDepartment(context.departmentActor, query.departement);
  const departmentId = selected && canAccessDepartment(context.departmentActor, selected.id) ? selected.id : null;

  const where = { departmentId: departmentId ?? '__aucun__' };
  const total = departmentId ? await prisma.readingList.count({ where }) : 0;
  const totalPages = Math.max(1, Math.ceil(total / READING_LISTS_PAGE_SIZE));
  const page = Math.min(query.page, totalPages);
  const lists = departmentId
    ? await prisma.readingList.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * READING_LISTS_PAGE_SIZE,
        take: READING_LISTS_PAGE_SIZE,
        select: {
          id: true,
          title: true,
          courseCode: true,
          academicYear: true,
          status: true,
          updatedAt: true,
          program: { select: { name: true } },
          owner: { select: { firstName: true, lastName: true } },
          _count: { select: { items: true } },
        },
      })
    : [];

  return (
    <DepartmentSpace active="/personnel/departement/listes" selected={selected} options={options}>
      {lists.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">Aucune liste dans ce département.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {lists.map((list) => (
            <li key={list.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-primary">{list.title}</p>
                  <p className="text-sm text-slate-500">
                    {[list.courseCode, list.program?.name, list.academicYear].filter(Boolean).join(' · ') || 'Sans code de cours'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {list.owner.firstName} {list.owner.lastName} · {list._count.items} ouvrage{list._count.items > 1 ? 's' : ''} · modifiée le{' '}
                    {formatDate(list.updatedAt)}
                  </p>
                </div>
                <Badge variant={READING_LIST_STATUS_BADGE[list.status]}>{READING_LIST_STATUS_LABELS[list.status]}</Badge>
              </div>
              {context.isLibraryStaff && list.status === 'PUBLISHED' ? (
                <ReasonActionForm
                  url={`/api/staff/reading-lists/${list.id}/unpublish`}
                  method="POST"
                  textField="reason"
                  textLabel="Motif de la dépublication (journalisé)"
                  actions={[{ label: 'Dépublier', reasonRequired: true }]}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        buildHref={(target) => buildListHref('/personnel/departement/listes', { departement: selected?.slug, page: target })}
      />
    </DepartmentSpace>
  );
}
