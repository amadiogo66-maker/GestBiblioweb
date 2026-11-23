import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { Badge } from '@/components/ui/Badge';
import { ApiActionButton } from '@/components/shared/ApiActionButton';
import { NoDepartmentNotice, Panel, TeacherSpace } from '@/components/teacher/TeacherSpace';
import { AcquisitionRequestForm } from '@/components/teacher/AcquisitionRequestForm';
import { requireTeacherPage } from '@/lib/teacher-access';
import { prisma } from '@/lib/prisma';
import { OPEN_STATUSES } from '@/lib/acquisitions';
import { ACQUISITION_OPEN_QUOTA } from '@/lib/constants';
import { ACQUISITION_STATUS_BADGE, ACQUISITION_STATUS_LABELS } from '@/lib/reading-labels';
import { formatDate } from '@/lib/utils';
import { acquisitionPrefillSchema } from '@/schemas/acquisition';
import { flattenSearchParams } from '@/schemas/staff';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Mes propositions d’acquisition - Gest Biblio' };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TeacherAcquisitionsPage({ searchParams }: PageProps): Promise<ReactElement> {
  const user = await requireTeacherPage();

  const { titre } = acquisitionPrefillSchema.parse(flattenSearchParams(await searchParams));
  const requests = await prisma.acquisitionRequest.findMany({
    where: { requesterId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      title: true,
      author: true,
      isbn: true,
      status: true,
      createdAt: true,
      departmentNote: true,
      libraryNote: true,
      department: { select: { name: true } },
    },
  });
  const openCount = requests.filter((request) => OPEN_STATUSES.includes(request.status)).length;

  return (
    <TeacherSpace
      title="Espace enseignant"
      description="Proposez l’achat d’un ouvrage : votre responsable de département valide, puis la bibliothèque décide."
      active="/enseignant/propositions"
    >
      {!user.departmentId ? (
        <NoDepartmentNotice />
      ) : (
        <Panel title="Nouvelle proposition">
          {openCount >= ACQUISITION_OPEN_QUOTA ? (
            <p className="text-sm text-slate-600">
              Vous avez déjà {ACQUISITION_OPEN_QUOTA} propositions en cours. Attendez une décision avant d&rsquo;en déposer une autre.
            </p>
          ) : (
            <AcquisitionRequestForm initialTitle={titre ?? ''} />
          )}
        </Panel>
      )}

      <Panel title={`Mes propositions (${openCount} en cours sur ${ACQUISITION_OPEN_QUOTA})`}>
        {requests.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune proposition pour l&rsquo;instant.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {requests.map((request) => (
              <li key={request.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-primary">{request.title}</p>
                    <p className="text-sm text-slate-500">
                      {request.author}
                      {request.isbn ? ` · ISBN ${request.isbn}` : ''} · {request.department.name} · déposée le {formatDate(request.createdAt)}
                    </p>
                  </div>
                  <Badge variant={ACQUISITION_STATUS_BADGE[request.status]}>{ACQUISITION_STATUS_LABELS[request.status]}</Badge>
                </div>
                {request.departmentNote ? <p className="text-sm text-slate-600">Département : {request.departmentNote}</p> : null}
                {request.libraryNote ? <p className="text-sm text-slate-600">Bibliothèque : {request.libraryNote}</p> : null}
                {request.status === 'SUBMITTED' ? (
                  <div>
                    <ApiActionButton url={`/api/teacher/acquisitions/${request.id}`} method="DELETE" confirm="Retirer cette proposition ?" variant="ghost">
                      Retirer la proposition
                    </ApiActionButton>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </TeacherSpace>
  );
}
