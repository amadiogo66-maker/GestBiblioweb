import type { ReactElement } from 'react';
import { NewsCard, type NewsCardData } from '@/components/shared/NewsCard';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { SectionHeading } from '@/components/ui/SectionHeading';

interface NewsSectionProps {
  news: NewsCardData[];
}

export function NewsSection({ news }: NewsSectionProps): ReactElement | null {
  if (news.length === 0) {
    return null;
  }

  return (
    <section className="bg-accent py-20">
      <Container>
        <SectionHeading
          eyebrow="Vie de la bibliothèque"
          title="Actualités"
          subtitle="Les dernières annonces de la bibliothèque."
          action={
            <Button href="/actualites" variant="outline" size="sm">
              Toutes les actualités
            </Button>
          }
        />

        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {news.map((item) => (
            <NewsCard key={item.id} news={item} />
          ))}
        </div>
      </Container>
    </section>
  );
}
