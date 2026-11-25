import Link from 'next/link';
import { ArrowLeft, Newspaper } from 'lucide-react';
import type { ReactElement } from 'react';
import { getPublishedNewsById, getRelatedNews, NEWS_CATEGORY_LABELS } from '@/lib/news-data';
import { ImageWithFallback } from '@/components/shared/ImageWithFallback';
import { NewsCard } from '@/components/shared/NewsCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface ActualitePageProps {
  params: Promise<{ id: string }>;
}

export default async function ActualitePage({ params }: ActualitePageProps): Promise<ReactElement> {
  const { id } = await params;
  // Brouillon, actualité dépubliée ou identifiant inconnu : même page « non trouvée ».
  const news = await getPublishedNewsById(id);

  if (!news) {
    return (
      <Container className="flex flex-col items-center gap-4 py-24 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Newspaper className="h-8 w-8" aria-hidden="true" />
        </span>
        <h1 className="font-serif text-2xl font-semibold text-primary">Actualité non trouvée</h1>
        <p className="max-w-md text-slate-500">Cette actualité n&rsquo;existe pas ou a été dépubliée.</p>
        <Button href="/actualites" variant="primary" size="md">
          Retour aux actualités
        </Button>
      </Container>
    );
  }

  const relatedNews = await getRelatedNews(news.id, news.category, 3);

  return (
    <div className="bg-white">
      <Container className="flex flex-col gap-8 py-12">
        <Link
          href="/actualites"
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Retour aux actualités
        </Link>

        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <Badge variant="primary">{NEWS_CATEGORY_LABELS[news.category] ?? news.category}</Badge>
            <time dateTime={news.publishedAt.toISOString()}>{formatDate(news.publishedAt)}</time>
          </div>
          <h1 className="font-serif text-3xl font-semibold text-primary sm:text-4xl">{news.title}</h1>
        </div>

        <ImageWithFallback
          src={news.image}
          alt={news.title}
          className="aspect-[21/9] w-full rounded-xl"
          fallback={<Newspaper className="h-12 w-12 text-primary/40" aria-hidden="true" />}
        />

        <div className="max-w-3xl whitespace-pre-line text-base leading-relaxed text-slate-700">{news.content}</div>
      </Container>

      {relatedNews.length > 0 ? (
        <section className="border-t border-slate-200 bg-accent py-16">
          <Container>
            <h2 className="font-serif text-xl font-semibold text-primary">Actualités similaires</h2>
            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
              {relatedNews.map((item) => (
                <NewsCard key={item.id} news={item} />
              ))}
            </div>
          </Container>
        </section>
      ) : null}
    </div>
  );
}
