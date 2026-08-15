import Link from 'next/link';
import type { ReactElement } from 'react';
import type { NewsCategory } from '@prisma/client';
import { NEWS_CATEGORIES, NEWS_CATEGORY_LABELS } from '@/lib/news-data';
import { cn } from '@/lib/utils';

interface CategoryFilterProps {
  activeCategory?: NewsCategory;
}

export function CategoryFilter({ activeCategory }: CategoryFilterProps): ReactElement {
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href="/actualites"
        className={cn(
          'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
          !activeCategory ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
        )}
      >
        Toutes
      </Link>
      {NEWS_CATEGORIES.map((category) => (
        <Link
          key={category}
          href={`/actualites?category=${category}`}
          className={cn(
            'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
            activeCategory === category ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          )}
        >
          {NEWS_CATEGORY_LABELS[category] ?? category}
        </Link>
      ))}
    </div>
  );
}
