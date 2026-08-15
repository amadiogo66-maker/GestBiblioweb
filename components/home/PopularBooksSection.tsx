import type { ReactElement } from 'react';
import { BookCard, type BookCardData } from '@/components/shared/BookCard';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { SectionHeading } from '@/components/ui/SectionHeading';

interface PopularBooksSectionProps {
  books: BookCardData[];
}

export function PopularBooksSection({ books }: PopularBooksSectionProps): ReactElement | null {
  if (books.length === 0) {
    return null;
  }

  return (
    <section className="bg-white py-20">
      <Container>
        <SectionHeading
          eyebrow="Tendances"
          title="Les plus empruntés"
          subtitle="Les ouvrages préférés de nos lecteurs."
          action={
            <Button href="/populaires" variant="outline" size="sm">
              Voir les populaires
            </Button>
          }
        />

        <div className="mt-10 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
          {books.map((book) => (
            <BookCard key={book.id} book={book} emphasis="popular" />
          ))}
        </div>
      </Container>
    </section>
  );
}
