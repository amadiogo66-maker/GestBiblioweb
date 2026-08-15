import { BookOpen } from 'lucide-react';
import type { ReactElement } from 'react';
import { ImageWithFallback } from '@/components/shared/ImageWithFallback';
import { Badge } from '@/components/ui/Badge';

export interface BookDetailData {
  title: string;
  author: string;
  summary: string | null;
  coverImage: string | null;
  isNew: boolean;
  category: string;
}

export function BookDetail({ book }: { book: BookDetailData }): ReactElement {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[2fr_3fr]">
      <div className="relative mx-auto w-full max-w-xs lg:mx-0 lg:max-w-none">
        <ImageWithFallback
          src={book.coverImage}
          alt={`Couverture de ${book.title}`}
          className="aspect-[2/3] w-full rounded-xl shadow-lg"
          fallback={<BookOpen className="h-16 w-16 text-primary/40" aria-hidden="true" />}
        />
        {book.isNew ? (
          <Badge variant="new" className="absolute left-3 top-3">
            Nouveau
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-secondary">{book.category}</p>
        <h1 className="font-serif text-3xl font-semibold text-primary sm:text-4xl">{book.title}</h1>
        <p className="text-lg text-secondary">{book.author}</p>
        {book.summary ? (
          <p className="line-clamp-6 text-base leading-relaxed text-slate-600">{book.summary}</p>
        ) : (
          <p className="text-base italic text-slate-400">Aucun résumé disponible pour cet ouvrage.</p>
        )}
      </div>
    </div>
  );
}
