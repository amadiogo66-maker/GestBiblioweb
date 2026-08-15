import type { ReactElement } from 'react';
import { BookCard, type CatalogueBookData } from '@/components/catalogue/BookCard';

interface BookGridProps {
  books: CatalogueBookData[];
}

export function BookGrid({ books }: BookGridProps): ReactElement {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {books.map((book) => (
        <BookCard key={book.id} book={book} />
      ))}
    </div>
  );
}
