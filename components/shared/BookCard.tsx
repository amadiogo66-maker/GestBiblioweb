import Link from 'next/link';
import { BookMarked, BookOpen } from 'lucide-react';
import type { ReactElement } from 'react';
import { ImageWithFallback } from '@/components/shared/ImageWithFallback';
import { Badge } from '@/components/ui/Badge';

export interface BookCardData {
  id: string;
  title: string;
  author: string;
  year: number | null;
  coverImage: string | null;
  isNew: boolean;
  loanCount: number;
}

interface BookCardProps {
  book: BookCardData;
  emphasis?: 'new' | 'popular';
}

export function BookCard({ book, emphasis }: BookCardProps): ReactElement {
  return (
    <Link
      href={`/ouvrage/${book.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
    >
      <ImageWithFallback
        src={book.coverImage}
        alt={`Couverture de ${book.title}`}
        className="aspect-[3/4] w-full"
        fallback={<BookOpen className="h-10 w-10 text-primary/40" aria-hidden="true" />}
      />
      <div className="flex flex-1 flex-col gap-1 p-4">
        {emphasis === 'new' ? (
          <Badge variant="new" className="mb-1 w-fit">
            Nouveau
          </Badge>
        ) : null}
        <h3 className="line-clamp-2 font-serif text-base font-semibold text-primary">{book.title}</h3>
        <p className="line-clamp-1 text-sm text-slate-600">{book.author}</p>
        <div className="mt-auto flex items-center justify-between pt-2 text-xs text-slate-500">
          <span>{book.year ?? '—'}</span>
          {emphasis === 'popular' ? (
            <span className="inline-flex items-center gap-1 font-medium text-secondary">
              <BookMarked className="h-3.5 w-3.5" aria-hidden="true" />
              {book.loanCount} emprunts
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
