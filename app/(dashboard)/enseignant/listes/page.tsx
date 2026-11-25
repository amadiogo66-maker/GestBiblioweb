import Link from 'next/link';
import { AlertTriangle, ListPlus } from 'lucide-react';
import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { NoDepartmentNotice, Panel, TeacherSpace } from '@/components/teacher/TeacherSpace';
import { requireTeacherPage } from '@/lib/teacher-access';
import { prisma } from '@/lib/prisma';
import { EMPTY_PUBLISHED_LIST_WARNING, READING_LIST_QUOTAS } from '@/lib/constants';
import { READING_LIST_STATUS_BADGE, READING_LIST_STATUS_LABELS } from '@/lib/reading-labels';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Mes listes de lectures - Gest Biblio' };

export default async function TeacherReadingListsPage(): Promise<ReactElement> {
  const user = await requireTeacherPage();

  const lists = await prisma.readingList.findMany({
    where: { ownerId: user.id },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      courseCode: true,
      academicYear: true,
      status: true,
      updatedAt: true,
      program: { select: { name: true } },
      department: { select: { name: true } },
      _count: { select: { items: true } },
    },
  });
  const canCreate = Boolean(user.departmentId) && lists.length < READING_LIST_QUOTAS.listsPerTeacher;

  return (
    <TeacherSpace title="Espace enseignant" description="Vos listes de lectures par cours, lues par les membres connectés." active="/enseignant/listes">
      {!user.departmentId ? <NoDepartmentNotice /> : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">
          {lists.length} liste{lists.length > 1 ? 's' : ''} sur {READING_LIST_QUOTAS.listsPerTeacher} autorisées.
        </p>
        {canCreate ? (
          <Button href="/enseignant/listes/nouvelle" size="sm">
            <ListPlus className="h-4 w-4" aria-hidden="true" />
            Nouvelle liste
          </Button>
        ) : null}
      </div>

      {lists.length === 0 ? (
        <Panel>
          <p className="text-sm text-slate-500">Vous n&rsquo;avez encore aucune liste de lectures.</p>
        </Panel>
      ) : (
        <ul className="flex flex-col gap-3">
          {lists.map((list) => (
            <li key={list.id}>
              <Link
                href={`/enseignant/listes/${list.id}`}
                className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-primary">{list.title}</p>
                  <p className="text-sm text-slate-500">
                    {[list.department.name, list.courseCode ?? 'Sans code de cours', list.program?.name, list.academicYear].filter(Boolean).join(' · ')}
                  </p>
                  {list.status === 'PUBLISHED' && list._count.items === 0 ? (
                    <p className="mt-1 flex items-center gap-1 text-xs font-medium text-danger">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {EMPTY_PUBLISHED_LIST_WARNING}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-3 text-sm text-slate-500">
                  <span>
                    {list._count.items} ouvrage{list._count.items > 1 ? 's' : ''}
                  </span>
                  <span>modifiée le {formatDate(list.updatedAt)}</span>
                  <Badge variant={READING_LIST_STATUS_BADGE[list.status]}>{READING_LIST_STATUS_LABELS[list.status]}</Badge>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </TeacherSpace>
  );
}
