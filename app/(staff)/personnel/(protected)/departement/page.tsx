import { BookCheck, FileClock, FilePen, Inbox, Users } from 'lucide-react';
import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { StatCard } from '@/components/dashboard/StatCard';
import { DepartmentSpace } from '@/components/staff/DepartmentSpace';
import { requireDepartmentManagerPage } from '@/lib/staff-page';
import { resolveScopedDepartment } from '@/lib/department-scope';
import { buildListHref } from '@/lib/list-url';
import { prisma } from '@/lib/prisma';
import { departmentPageQuerySchema, flattenSearchParams } from '@/schemas/staff';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Espace département - Gest Biblio' };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Agrégats du département (count, groupBy) : aucune ligne individuelle n'est lue. */
async function departmentStats(departmentId: string) {
  const [activeMembers, lists, proposals] = await Promise.all([
    prisma.user.count({ where: { departmentId, status: 'ACTIVE' } }),
    prisma.readingList.groupBy({ by: ['status'], where: { departmentId }, _count: { _all: true } }),
    prisma.acquisitionRequest.groupBy({ by: ['status'], where: { departmentId }, _count: { _all: true } }),
  ]);
  const count = (rows: Array<{ status: string; _count: { _all: number } }>, status: string) =>
    rows.find((row) => row.status === status)?._count._all ?? 0;

  return {
    activeMembers,
    publishedLists: count(lists, 'PUBLISHED'),
    draftLists: count(lists, 'DRAFT'),
    pendingProposals: count(proposals, 'SUBMITTED'),
    forwardedProposals: count(proposals, 'DEPT_APPROVED'),
  };
}

export default async function DepartmentDashboardPage({ searchParams }: PageProps): Promise<ReactElement> {
  const context = await requireDepartmentManagerPage();

  const query = departmentPageQuerySchema.parse(flattenSearchParams(await searchParams));
  const { selected, options } = await resolveScopedDepartment(context.departmentActor, query.departement);
  const stats = selected ? await departmentStats(selected.id) : null;
  const href = (path: string) => buildListHref(path, { departement: selected?.slug });

  return (
    <DepartmentSpace active="/personnel/departement" selected={selected} options={options}>
      {stats ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard icon={Users} label="Membres actifs rattachés" value={stats.activeMembers} href={href('/personnel/departement')} />
          <StatCard icon={BookCheck} label="Listes publiées" value={stats.publishedLists} href={href('/personnel/departement/listes')} />
          <StatCard icon={FilePen} label="Listes en brouillon" value={stats.draftLists} href={href('/personnel/departement/listes')} />
          <StatCard icon={Inbox} label="Propositions à examiner" value={stats.pendingProposals} href={href('/personnel/departement/propositions')} />
          <StatCard icon={FileClock} label="Propositions transmises à la bibliothèque" value={stats.forwardedProposals} href={href('/personnel/departement/propositions')} />
        </div>
      ) : null}
    </DepartmentSpace>
  );
}
