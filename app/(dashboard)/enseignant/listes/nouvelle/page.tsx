import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { NoDepartmentNotice, Panel, TeacherSpace } from '@/components/teacher/TeacherSpace';
import { ReadingListForm } from '@/components/teacher/ReadingListForm';
import { requireTeacherPage } from '@/lib/teacher-access';
import { prisma } from '@/lib/prisma';
import { READING_LIST_QUOTAS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Nouvelle liste de lectures - Gest Biblio' };

export default async function NewReadingListPage(): Promise<ReactElement> {
  const user = await requireTeacherPage();

  const [count, programs] = user.departmentId
    ? await Promise.all([
        prisma.readingList.count({ where: { ownerId: user.id } }),
        prisma.program.findMany({ where: { departmentId: user.departmentId }, select: { id: true, name: true }, orderBy: { sortOrder: 'asc' } }),
      ])
    : [0, []];

  return (
    <TeacherSpace title="Nouvelle liste de lectures" description="La liste est créée en brouillon : publiez-la quand elle est prête." active="/enseignant/listes">
      {!user.departmentId ? (
        <NoDepartmentNotice />
      ) : count >= READING_LIST_QUOTAS.listsPerTeacher ? (
        <Panel>
          <p className="text-sm text-slate-600">
            Vous avez atteint la limite de {READING_LIST_QUOTAS.listsPerTeacher} listes. Supprimez une liste avant d&rsquo;en créer une autre.
          </p>
        </Panel>
      ) : (
        <Panel>
          <ReadingListForm programs={programs} />
        </Panel>
      )}
    </TeacherSpace>
  );
}
