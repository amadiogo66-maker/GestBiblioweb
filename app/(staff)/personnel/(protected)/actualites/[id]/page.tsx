import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { Badge } from '@/components/ui/Badge';
import { ApiActionButton } from '@/components/shared/ApiActionButton';
import { NewsForm } from '@/components/staff/NewsForm';
import { requireStaffPage } from '@/lib/staff-page';
import { prisma } from '@/lib/prisma';
import { NEWS_CATEGORY_LABELS, newsCategoryOptions } from '@/lib/news-data';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Actualité - Gest Biblio' };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditStaffNewsPage({ params }: PageProps): Promise<ReactElement> {
  const context = await requireStaffPage('ADMIN', 'LIBRARIAN');

  const { id } = await params;
  const news = await prisma.news.findUnique({
    where: { id },
    select: { id: true, title: true, content: true, category: true, source: true, isPublished: true, publishedAt: true, createdAt: true },
  });

  if (!news) {
    notFound();
  }

  const fromSoftware = news.source === 'SOFTWARE';
  const apiUrl = `/api/staff/news/${news.id}`;

  return (
    <>
      <div className="flex flex-col gap-3">
        <Link href="/personnel/actualites" className="text-sm text-primary underline">
          Retour aux actualités
        </Link>
        <h1 className="break-words font-serif text-2xl font-semibold text-primary">{news.title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          {fromSoftware ? <Badge variant="neutral">Géré dans le logiciel</Badge> : <Badge variant="primary">Site</Badge>}
          <Badge variant={news.isPublished ? 'success' : 'neutral'}>{news.isPublished ? 'Publiée' : news.publishedAt ? 'Dépubliée' : 'Brouillon'}</Badge>
          <span>{news.publishedAt ? `Première publication le ${formatDate(news.publishedAt)}` : 'Jamais publiée'}</span>
        </div>
      </div>

      {fromSoftware ? (
        // Lecture seule : aucune action depuis le site (l'API refuse aussi, 403).
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Cette actualité est gérée dans le logiciel de gestion : modifiez-la, publiez-la ou supprimez-la depuis le logiciel.
          </p>
          <p className="text-sm text-slate-500">Catégorie : {NEWS_CATEGORY_LABELS[news.category] ?? news.category}</p>
          <div className="whitespace-pre-line break-words text-slate-700">{news.content}</div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-4">
            <ApiActionButton url={apiUrl} method="PATCH" body={{ isPublished: !news.isPublished }} variant={news.isPublished ? 'outline' : 'primary'}>
              {news.isPublished ? 'Dépublier' : 'Publier'}
            </ApiActionButton>
            {news.isPublished ? (
              <Link href={`/actualites/${news.id}`} className="self-center text-sm text-primary underline">
                Voir sur le site
              </Link>
            ) : null}
            {context.isAdmin ? (
              <ApiActionButton url={apiUrl} method="DELETE" confirm="Supprimer définitivement cette actualité ?" redirectTo="/personnel/actualites" variant="ghost">
                Supprimer
              </ApiActionButton>
            ) : null}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
            <NewsForm newsId={news.id} categories={newsCategoryOptions()} initial={{ title: news.title, category: news.category, content: news.content }} />
          </div>
        </>
      )}
    </>
  );
}
