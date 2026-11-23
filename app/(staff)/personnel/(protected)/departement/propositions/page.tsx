import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { Pagination } from '@/components/shared/Pagination';
import { ReasonActionForm, type ReasonAction } from '@/components/shared/ReasonActionForm';
import { DepartmentSpace } from '@/components/staff/DepartmentSpace';
import { requireDepartmentManagerPage } from '@/lib/staff-page';
import { resolveScopedDepartment } from '@/lib/department-scope';
import { canAccessDepartment } from '@/lib/department-access';
import { buildListHref } from '@/lib/list-url';
import { prisma } from '@/lib/prisma';
import { ACQUISITIONS_PAGE_SIZE } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import { departmentPageQuerySchema, flattenSearchParams } from '@/schemas/staff';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Propositions du département - Gest Biblio' };

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

const DEPARTMENT_DECISIONS: ReasonAction[] = [
  { value: 'approve', label: 'Valider et transmettre', reasonRequired: false, variant: 'primary' as const },
  { value: 'reject', label: 'Refuser', reasonRequired: true },
];

export default async function DepartmentProposalsPage({ searchParams }: PageProps): Promise<ReactElement> {
  const context = await requireDepartmentManagerPage();

  const query = departmentPageQuerySchema.parse(flattenSearchParams(await searchParams));
  const { selected, options } = await resolveScopedDepartment(context.departmentActor, query.departement);
  const departmentId = selected && canAccessDepartment(context.departmentActor, selected.id) ? selected.id : null;

  const where = { departmentId: departmentId ?? '__aucun__', status: 'SUBMITTED' as const };
  const total = departmentId ? await prisma.acquisitionRequest.count({ where }) : 0;
  const totalPages = Math.max(1, Math.ceil(total / ACQUISITIONS_PAGE_SIZE));
  const page = Math.min(query.page, totalPages);
  const requests = departmentId
    ? await prisma.acquisitionRequest.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * ACQUISITIONS_PAGE_SIZE,
        take: ACQUISITIONS_PAGE_SIZE,
        select: {
          id: true,
          title: true,
          author: true,
          isbn: true,
          publisher: true,
          year: true,
          justification: true,
          createdAt: true,
          requester: { select: { firstName: true, lastName: true } },
        },
      })
    : [];

  return (
    <DepartmentSpace active="/personnel/departement/propositions" selected={selected} options={options}>
      <p className="text-sm text-slate-500">
        {total} proposition{total > 1 ? 's' : ''} en attente de votre décision.
      </p>
      {requests.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">Aucune proposition à examiner.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {requests.map((request) => (
            <li key={request.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <div>
                <p className="font-medium text-primary">{request.title}</p>
                <p className="text-sm text-slate-500">
                  {[request.author, request.publisher, request.year, request.isbn ? `ISBN ${request.isbn}` : null].filter(Boolean).join(' · ')}
                </p>
                <p className="text-xs text-slate-500">
                  Proposée par {request.requester.firstName} {request.requester.lastName} le {formatDate(request.createdAt)}
                </p>
              </div>
              <p className="whitespace-pre-line text-sm text-slate-700">{request.justification}</p>
              <ReasonActionForm
                url={`/api/staff/acquisitions/${request.id}`}
                method="PATCH"
                textField="note"
                textLabel="Note ou motif (motif obligatoire pour un refus)"
                actions={DEPARTMENT_DECISIONS}
              />
            </li>
          ))}
        </ul>
      )}
      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        buildHref={(target) => buildListHref('/personnel/departement/propositions', { departement: selected?.slug, page: target })}
      />
    </DepartmentSpace>
  );
}
