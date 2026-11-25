import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { NewsForm } from '@/components/staff/NewsForm';
import { requireStaffPage } from '@/lib/staff-page';
import { newsCategoryOptions } from '@/lib/news-data';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Nouvelle actualité - Gest Biblio' };

export default async function NewStaffNewsPage(): Promise<ReactElement> {
  await requireStaffPage('ADMIN', 'LIBRARIAN');

  return (
    <>
      <div>
        <Link href="/personnel/actualites" className="text-sm text-primary underline">
          Retour aux actualités
        </Link>
        <h1 className="mt-2 font-serif text-2xl font-semibold text-primary">Nouvelle actualité</h1>
        <p className="mt-1 text-sm text-slate-500">Enregistrez un brouillon ou publiez directement sur le site.</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        <NewsForm categories={newsCategoryOptions()} />
      </div>
    </>
  );
}
