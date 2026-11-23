import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/shared/Pagination';
import { ReasonActionForm, type ReasonAction } from '@/components/shared/ReasonActionForm';
import { requireStaffPage } from '@/lib/staff-page';
import { buildListHref } from '@/lib/list-url';
import { prisma } from '@/lib/prisma';
import { ACQUISITIONS_PAGE_SIZE } from '@/lib/constants';
import { ACQUISITION_STATUSES, ACQUISITION_STATUS_BADGE, ACQUISITION_STATUS_LABELS, type AcquisitionStatusValue } from '@/lib/reading-labels';
import { formatDate } from '@/lib/utils';
import { acquisitionsQuerySchema } from '@/schemas/acquisition';
import { flattenSearchParams } from '@/schemas/staff';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Acquisitions - Gest Biblio' };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Actions possibles selon l'étape (l'API revérifie tout). SUBMITTED : à la place d'un responsable absent. */
const ACTIONS: Partial<Record<AcquisitionStatusValue, ReasonAction[]>> = {
  SUBMITTED: [
    { value: 'approve', label: 'Valider à la place du département', reasonRequired: false },
    { value: 'reject', label: 'Refuser à la place du département', reasonRequired: true },
  ],
  DEPT_APPROVED: [
    { value: 'accept', label: 'Accepter', reasonRequired: false, variant: 'primary' },
    { value: 'refuse', label: 'Refuser', reasonRequired: true },
  ],
  LIBRARY_ACCEPTED: [{ value: 'acquired', label: 'Marquer comme acquis', reasonRequired: false, variant: 'primary' }],
};

const selectClass =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

export default async function LibraryAcquisitionsPage({ searchParams }: PageProps): Promise<ReactElement> {
  await requireStaffPage('ADMIN', 'LIBRARIAN');

  const query = acquisitionsQuerySchema.parse(flattenSearchParams(await searchParams));
  const status = query.statut ?? 'DEPT_APPROVED';
  const departments = await prisma.department.findMany({ select: { id: true, slug: true, name: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  const department = query.departement ? departments.find((item) => item.slug === query.departement) ?? null : null;
  const where: Prisma.AcquisitionRequestWhereInput = {
    status,
    ...(query.departement ? { departmentId: department?.id ?? '__aucun__' } : {}),
  };
  const total = await prisma.acquisitionRequest.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / ACQUISITIONS_PAGE_SIZE));
  const page = Math.min(query.page, totalPages);
  const requests = await prisma.acquisitionRequest.findMany({
    where,
    orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
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
      status: true,
      createdAt: true,
      departmentNote: true,
      libraryNote: true,
      department: { select: { name: true } },
      requester: { select: { firstName: true, lastName: true } },
    },
  });
  const filters = { statut: status === 'DEPT_APPROVED' ? undefined : status, departement: query.departement };

  return (
    <>
      <div>
        <h1 className="font-serif text-2xl font-semibold text-primary">Propositions d&rsquo;acquisition</h1>
        <p className="mt-1 text-sm text-slate-500">Propositions validées par les départements : acceptez, refusez, puis marquez l&rsquo;arrivée de l&rsquo;ouvrage.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {ACQUISITION_STATUSES.map((value) => (
          <Link
            key={value}
            href={buildListHref('/personnel/acquisitions', { ...filters, statut: value === 'DEPT_APPROVED' ? undefined : value, page: undefined })}
            aria-current={status === value ? 'page' : undefined}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              status === value ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            {ACQUISITION_STATUS_LABELS[value]}
          </Link>
        ))}
      </div>

      <form method="get" className="flex flex-col gap-2 sm:flex-row sm:items-end">
        {filters.statut ? <input type="hidden" name="statut" value={filters.statut} /> : null}
        <div className="flex flex-col gap-1">
          <label htmlFor="acq-dept" className="text-xs font-medium text-slate-600">
            Département
          </label>
          <select id="acq-dept" name="departement" defaultValue={query.departement ?? ''} className={selectClass}>
            <option value="">Tous</option>
            {departments.map((item) => (
              <option key={item.id} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded-lg border border-primary/30 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/5">
          Filtrer
        </button>
      </form>

      <p className="text-sm text-slate-500">
        {total} proposition{total > 1 ? 's' : ''} : {ACQUISITION_STATUS_LABELS[status].toLowerCase()}.
      </p>

      {requests.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">Aucune proposition.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {requests.map((request) => {
            const actions = ACTIONS[request.status];

            return (
              <li key={request.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-primary">{request.title}</p>
                    <p className="text-sm text-slate-500">
                      {[request.author, request.publisher, request.year, request.isbn ? `ISBN ${request.isbn}` : null].filter(Boolean).join(' · ')}
                    </p>
                    <p className="text-xs text-slate-500">
                      {request.department.name} · {request.requester.firstName} {request.requester.lastName} · {formatDate(request.createdAt)}
                    </p>
                  </div>
                  <Badge variant={ACQUISITION_STATUS_BADGE[request.status]}>{ACQUISITION_STATUS_LABELS[request.status]}</Badge>
                </div>
                <p className="whitespace-pre-line text-sm text-slate-700">{request.justification}</p>
                {request.departmentNote ? <p className="text-sm text-slate-600">Note du département : {request.departmentNote}</p> : null}
                {request.libraryNote ? <p className="text-sm text-slate-600">Note de la bibliothèque : {request.libraryNote}</p> : null}
                {actions ? (
                  <ReasonActionForm url={`/api/staff/acquisitions/${request.id}`} method="PATCH" textField="note" textLabel="Note (motif obligatoire pour un refus)" actions={actions} />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <Pagination page={page} totalPages={totalPages} total={total} buildHref={(target) => buildListHref('/personnel/acquisitions', { ...filters, page: target })} />
    </>
  );
}
