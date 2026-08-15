import Link from 'next/link';
import { Newspaper } from 'lucide-react';
import type { ReactElement } from 'react';
import { ImageWithFallback } from '@/components/shared/ImageWithFallback';
import { Badge } from '@/components/ui/Badge';
import { formatDate } from '@/lib/utils';
import { NEWS_CATEGORY_LABELS } from '@/lib/news-data';

export interface NewsCardData {
  id: string;
  title: string;
  content: string;
  image: string | null;
  category: string;
  publishedAt: Date | string;
}

export function NewsCard({ news }: { news: NewsCardData }): ReactElement {
  const excerpt = news.content.length > 140 ? `${news.content.slice(0, 140).trim()}…` : news.content;

  return (
    <Link
      href={`/actualites/${news.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
    >
      <ImageWithFallback
        src={news.image}
        alt={news.title}
        className="aspect-[16/9] w-full"
        fallback={<Newspaper className="h-10 w-10 text-primary/40" aria-hidden="true" />}
      />
      <div className="flex flex-1 flex-col gap-2 p-5">
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <Badge variant="primary">{NEWS_CATEGORY_LABELS[news.category] ?? news.category}</Badge>
          <time dateTime={new Date(news.publishedAt).toISOString()}>{formatDate(news.publishedAt)}</time>
        </div>
        <h3 className="line-clamp-2 font-serif text-lg font-semibold text-primary">{news.title}</h3>
        <p className="line-clamp-2 text-sm text-slate-600">{excerpt}</p>
      </div>
    </Link>
  );
}
