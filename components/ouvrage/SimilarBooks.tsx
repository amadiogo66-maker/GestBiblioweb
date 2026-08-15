import type { ReactElement } from 'react';
import { BookCard, type CatalogueBookData } from '@/components/catalogue/BookCard';
import { Container } from '@/components/ui/Container';
import { SectionHeading } from '@/components/ui/SectionHeading';

interface SimilarBooksProps {
  books: CatalogueBookData[];
}

export function SimilarBooks({ books }: SimilarBooksProps): ReactElement | null {
  if (books.length === 0) {
    return null;
  }

  return (
    <section className="border-t border-slate-200 bg-accent py-16">
      <Container>
        <SectionHeading eyebrow="Découvrir" title="Ouvrages similaires" />
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {books.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      </Container>
    </section>
  );
}
