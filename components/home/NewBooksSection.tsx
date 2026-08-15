import type { ReactElement } from 'react';
import { BookCard, type BookCardData } from '@/components/shared/BookCard';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { SectionHeading } from '@/components/ui/SectionHeading';

interface NewBooksSectionProps {
  books: BookCardData[];
}

export function NewBooksSection({ books }: NewBooksSectionProps): ReactElement | null {
  if (books.length === 0) {
    return null;
  }

  return (
    <section className="bg-accent py-20">
      <Container>
        <SectionHeading
          eyebrow="Collection"
          title="Nouveautés"
          subtitle="Les derniers ouvrages ajoutés à notre collection."
          action={
            <Button href="/nouveautes" variant="outline" size="sm">
              Voir toutes les nouveautés
            </Button>
          }
        />

        <div className="mt-10 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
          {books.map((book) => (
            <BookCard key={book.id} book={book} emphasis="new" />
          ))}
        </div>
      </Container>
    </section>
  );
}
