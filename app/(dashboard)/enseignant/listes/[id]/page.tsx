import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowDown, ArrowUp, Search } from 'lucide-react';
import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ApiActionButton } from '@/components/shared/ApiActionButton';
import { Panel, TeacherSpace } from '@/components/teacher/TeacherSpace';
import { ReadingListForm } from '@/components/teacher/ReadingListForm';
import { ItemNoteForm } from '@/components/teacher/ItemNoteForm';
import { PublishListControl } from '@/components/teacher/PublishListControl';
import { countReadingListRecipients, readingListAlreadyNotified } from '@/lib/reading-list-notify';
import { requireTeacherPage } from '@/lib/teacher-access';
import { prisma } from '@/lib/prisma';
import { READING_LIST_QUOTAS } from '@/lib/constants';
import { buildListHref } from '@/lib/list-url';
import { READING_LIST_STATUS_BADGE, READING_LIST_STATUS_LABELS } from '@/lib/reading-labels';
import { catalogSearchQuerySchema } from '@/schemas/reading-list';
import { flattenSearchParams } from '@/schemas/staff';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Liste de lectures - Gest Biblio' };

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const SEARCH_RESULTS = 10;

export default async function EditReadingListPage({ params, searchParams }: PageProps): Promise<ReactElement> {
  const user = await requireTeacherPage();

  const { id } = await params;
  // La liste d'un autre enseignant est introuvable, comme une liste inexistante.
  const list = await prisma.readingList.findFirst({
    where: { id, ownerId: user.id },
    select: {
      id: true,
      title: true,
      courseCode: true,
      academicYear: true,
      description: true,
      status: true,
      programId: true,
      departmentId: true,
      department: { select: { name: true } },
      items: {
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, note: true, book: { select: { id: true, title: true, author: true, availableCopies: true } } },
      },
    },
  });

  if (!list) {
    notFound();
  }

  const { q } = catalogSearchQuerySchema.parse(flattenSearchParams(await searchParams));
  const inList = new Set(list.items.map((item) => item.book.id));
  const draft = list.status !== 'PUBLISHED';
  const [programs, results, recipients, alreadyNotified] = await Promise.all([
    prisma.program.findMany({ where: { departmentId: list.departmentId }, select: { id: true, name: true }, orderBy: { sortOrder: 'asc' } }),
    q
      ? prisma.book.findMany({
          where: {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { author: { contains: q, mode: 'insensitive' } },
              { isbn: { contains: q } },
            ],
          },
          orderBy: { title: 'asc' },
          take: SEARCH_RESULTS,
          select: { id: true, title: true, author: true, year: true },
        })
      : Promise.resolve([]),
    // Destinataires possibles : comptage agrégé, seulement pour un brouillon (case de publication).
    draft ? countReadingListRecipients(list.departmentId, user.id) : Promise.resolve(0),
    draft ? readingListAlreadyNotified(list.id) : Promise.resolve(false),
  ]);
  const apiBase = `/api/teacher/reading-lists/${list.id}`;
  const isFull = list.items.length >= READING_LIST_QUOTAS.itemsPerList;
  const published = list.status === 'PUBLISHED';

  return (
    <TeacherSpace title={list.title} description={`Département : ${list.department.name}`} active="/enseignant/listes">
      <Panel>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Badge variant={READING_LIST_STATUS_BADGE[list.status]}>{READING_LIST_STATUS_LABELS[list.status]}</Badge>
            {published ? (
              <Link href={`/listes-de-lecture/${list.id}`} className="text-sm text-primary underline">
                Voir comme un étudiant
              </Link>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {published ? (
              <ApiActionButton url={apiBase} method="PATCH" body={{ status: 'DRAFT' }} variant="outline">
                Repasser en brouillon
              </ApiActionButton>
            ) : (
              <PublishListControl url={apiBase} recipients={recipients} alreadyNotified={alreadyNotified} />
            )}
            <ApiActionButton url={apiBase} method="DELETE" confirm="Supprimer définitivement cette liste ?" redirectTo="/enseignant/listes" variant="ghost">
              Supprimer
            </ApiActionButton>
          </div>
        </div>
      </Panel>

      <Panel title="Informations">
        <ReadingListForm
          listId={list.id}
          programs={programs}
          initial={{
            title: list.title,
            courseCode: list.courseCode ?? '',
            academicYear: list.academicYear ?? '',
            description: list.description ?? '',
            programId: list.programId ?? '',
          }}
        />
      </Panel>

      <Panel title={`Ouvrages (${list.items.length} sur ${READING_LIST_QUOTAS.itemsPerList})`}>
        {list.items.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun ouvrage pour l&rsquo;instant : recherchez-en dans le catalogue ci-dessous.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {list.items.map((item, index) => (
              <li key={item.id} className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <Link href={`/ouvrage/${item.book.id}`} className="font-medium text-primary hover:underline">
                      {index + 1}. {item.book.title}
                    </Link>
                    <p className="text-sm text-slate-500">{item.book.author}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1">
                    <ApiActionButton url={`${apiBase}/items/${item.id}`} method="PATCH" body={{ move: 'up' }} variant="ghost" ariaLabel="Monter">
                      <ArrowUp className="h-4 w-4" aria-hidden="true" />
                    </ApiActionButton>
                    <ApiActionButton url={`${apiBase}/items/${item.id}`} method="PATCH" body={{ move: 'down' }} variant="ghost" ariaLabel="Descendre">
                      <ArrowDown className="h-4 w-4" aria-hidden="true" />
                    </ApiActionButton>
                    <ApiActionButton url={`${apiBase}/items/${item.id}`} method="DELETE" variant="ghost" confirm="Retirer cet ouvrage de la liste ?">
                      Retirer
                    </ApiActionButton>
                  </div>
                </div>
                <ItemNoteForm url={`${apiBase}/items/${item.id}`} initialNote={item.note ?? ''} />
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <Panel title="Ajouter un ouvrage du catalogue">
        <form method="get" className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="catalog-q" className="sr-only">
            Titre, auteur ou ISBN
          </label>
          <input
            id="catalog-q"
            name="q"
            defaultValue={q ?? ''}
            maxLength={100}
            placeholder="Titre, auteur ou ISBN"
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <Button type="submit" size="sm" variant="outline">
            <Search className="h-4 w-4" aria-hidden="true" />
            Rechercher
          </Button>
        </form>

        {q ? (
          results.length === 0 ? (
            <div className="flex flex-col gap-2 text-sm text-slate-600">
              <p>Aucun ouvrage du catalogue ne correspond à « {q} ».</p>
              <Link href={buildListHref('/enseignant/propositions', { titre: q })} className="font-medium text-primary underline">
                Proposer son acquisition
              </Link>
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-slate-100">
              {results.map((book) => (
                <li key={book.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800">{book.title}</p>
                    <p className="text-sm text-slate-500">
                      {book.author}
                      {book.year ? ` · ${book.year}` : ''}
                    </p>
                  </div>
                  {inList.has(book.id) ? (
                    <span className="text-sm text-slate-500">Déjà dans la liste</span>
                  ) : isFull ? (
                    <span className="text-sm text-slate-500">Liste complète</span>
                  ) : (
                    <ApiActionButton url={`${apiBase}/items`} method="POST" body={{ bookId: book.id }} variant="primary">
                      Ajouter
                    </ApiActionButton>
                  )}
                </li>
              ))}
            </ul>
          )
        ) : null}
        {q && results.length > 0 ? (
          <p className="text-xs text-slate-500">
            L&rsquo;ouvrage n&rsquo;y est pas ?{' '}
            <Link href={buildListHref('/enseignant/propositions', { titre: q })} className="text-primary underline">
              Proposer son acquisition
            </Link>
          </p>
        ) : null}
      </Panel>
    </TeacherSpace>
  );
}
