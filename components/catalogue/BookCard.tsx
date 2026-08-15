import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import type { ReactElement } from 'react';
import { ImageWithFallback } from '@/components/shared/ImageWithFallback';
import { Badge } from '@/components/ui/Badge';

export interface CatalogueBookData {
  id: string;
  title: string;
  author: string;
  year: number | null;
  coverImage: string | null;
  isNew: boolean;
  availableCopies: number;
  department: string;
  category: string;
}

export function BookCard({ book }: { book: CatalogueBookData }): ReactElement {
  const isAvailable = book.availableCopies > 0;

  return (
    <Link
      href={`/ouvrage/${book.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
    >
      <div className="relative">
        <ImageWithFallback
          src={book.coverImage}
          alt={`Couverture de ${book.title}`}
          className="aspect-[3/4] w-full"
          fallback={<BookOpen className="h-10 w-10 text-primary/40" aria-hidden="true" />}
        />
        {book.isNew ? <Badge variant="new" className="absolute left-2 top-2">Nouveau</Badge> : null}
        <Badge variant={isAvailable ? 'success' : 'danger'} className="absolute right-2 top-2">
          {isAvailable ? 'Disponible' : 'Indisponible'}
        </Badge>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-secondary">{book.category}</p>
        <h3 className="line-clamp-2 font-serif text-base font-semibold text-primary">{book.title}</h3>
        <p className="line-clamp-1 text-sm text-slate-600">{book.author}</p>
        <p className="mt-auto pt-2 text-xs text-slate-500">{book.year ?? '—'}</p>
      </div>
    </Link>
  );
}
