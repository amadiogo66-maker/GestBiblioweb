import type { ReactElement } from 'react';

export interface BookMetadataData {
  isbn: string;
  publisher: string | null;
  year: number | null;
  department: string;
  category: string;
  location: string | null;
  totalCopies: number;
  availableCopies: number;
  loanCount: number;
}

export function BookMetadata({ book }: { book: BookMetadataData }): ReactElement {
  const rows: { label: string; value: string }[] = [
    { label: 'ISBN', value: book.isbn },
    { label: 'Éditeur', value: book.publisher ?? '—' },
    { label: 'Année', value: book.year ? String(book.year) : '—' },
    { label: 'Département', value: book.department },
    { label: 'Catégorie', value: book.category },
    { label: 'Lieu', value: book.location ?? '—' },
    { label: 'Exemplaires totaux', value: String(book.totalCopies) },
    { label: 'Exemplaires disponibles', value: String(book.availableCopies) },
    { label: 'Nombre d’emprunts', value: String(book.loanCount) },
  ];

  return (
    <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-4 px-5 py-3">
          <dt className="text-sm text-slate-500">{row.label}</dt>
          <dd className="text-sm font-medium text-primary">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
