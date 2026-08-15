import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactElement } from 'react';
import { getPageNumbers } from '@/lib/pagination';
import { cn } from '@/lib/utils';

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  buildHref: (page: number) => string;
}

export function Pagination({ page, totalPages, total, buildHref }: PaginationProps): ReactElement | null {
  if (totalPages <= 1) {
    return null;
  }

  const pages = getPageNumbers(page, totalPages);
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <nav className="flex flex-col items-center gap-4 pt-4" aria-label="Pagination">
      <div className="flex items-center gap-1">
        <Link
          href={buildHref(Math.max(1, page - 1))}
          aria-disabled={!hasPrev}
          aria-label="Page précédente"
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50',
            !hasPrev && 'pointer-events-none opacity-40'
          )}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Link>

        {pages.map((item, index) =>
          item === 'ellipsis' ? (
            <span key={`ellipsis-${index}`} className="px-2 text-slate-400">
              …
            </span>
          ) : (
            <Link
              key={item}
              href={buildHref(item)}
              aria-current={item === page ? 'page' : undefined}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-lg text-sm font-medium transition-colors',
                item === page ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-100'
              )}
            >
              {item}
            </Link>
          )
        )}

        <Link
          href={buildHref(Math.min(totalPages, page + 1))}
          aria-disabled={!hasNext}
          aria-label="Page suivante"
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50',
            !hasNext && 'pointer-events-none opacity-40'
          )}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <p className="text-sm text-slate-500">
        Page {page} sur {totalPages} — {total} résultat{total > 1 ? 's' : ''}
      </p>
    </nav>
  );
}
