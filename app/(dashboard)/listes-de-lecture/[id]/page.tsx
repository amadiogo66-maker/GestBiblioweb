import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { Badge } from '@/components/ui/Badge';
import { requireActiveDashboardUser } from '@/lib/dashboard-access';
import { getPublishedReadingList } from '@/lib/reading-lists';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Liste de lectures - Gest Biblio' };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ReadingListDetailPage({ params }: PageProps): Promise<ReactElement> {
  await requireActiveDashboardUser();

  const { id } = await params;
  // Brouillon ou liste inconnue : même réponse, l'existence n'est pas révélée.
  const list = await getPublishedReadingList(id);

  if (!list) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/listes-de-lecture" className="text-sm text-primary hover:underline">
          ← Toutes les listes
        </Link>
        <h1 className="font-serif text-2xl font-semibold text-primary">{list.title}</h1>
        <p className="text-sm text-slate-600">
          {[list.courseCode, list.department.name, list.program?.name, list.academicYear].filter(Boolean).join(' · ')}
        </p>
        <p className="text-xs text-slate-500">
          Mise à jour le {formatDate(list.updatedAt)}
          {list.teacherName ? ` · ${list.teacherName}` : ''}
        </p>
        {list.description ? <p className="whitespace-pre-line text-sm text-slate-700">{list.description}</p> : null}
      </div>

      {list.items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
          Cette liste ne contient encore aucun ouvrage.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {list.items.map((item, index) => {
            const available = item.book.status === 'AVAILABLE' && item.book.availableCopies > 0;

            return (
              <li key={item.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <Link href={`/ouvrage/${item.book.id}`} className="font-medium text-primary hover:underline">
                    {index + 1}. {item.book.title}
                  </Link>
                  <p className="text-sm text-slate-500">
                    {item.book.author}
                    {item.book.year ? ` · ${item.book.year}` : ''}
                  </p>
                  {item.note ? <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{item.note}</p> : null}
                </div>
                <Badge variant={available ? 'success' : 'neutral'} className="shrink-0">
                  {available ? `${item.book.availableCopies} disponible${item.book.availableCopies > 1 ? 's' : ''}` : 'Indisponible'}
                </Badge>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
