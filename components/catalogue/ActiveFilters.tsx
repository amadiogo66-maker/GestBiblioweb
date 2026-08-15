import Link from 'next/link';
import { X } from 'lucide-react';
import type { ReactElement } from 'react';
import { buildCatalogueHref, type CatalogueFilterValues } from '@/lib/catalogue-url';

interface ActiveFiltersProps {
  currentFilters: CatalogueFilterValues;
}

const AVAILABILITY_LABELS: Record<string, string> = {
  available: 'Disponible',
  unavailable: 'Indisponible',
};

export function ActiveFilters({ currentFilters }: ActiveFiltersProps): ReactElement | null {
  const chips: { key: string; href: string; label: string }[] = [];

  if (currentFilters.query) {
    chips.push({
      key: 'query',
      href: buildCatalogueHref(currentFilters, { query: undefined }),
      label: `« ${currentFilters.query} »`,
    });
  }
  if (currentFilters.department) {
    chips.push({
      key: 'department',
      href: buildCatalogueHref(currentFilters, { department: undefined }),
      label: currentFilters.department,
    });
  }
  if (currentFilters.category) {
    chips.push({
      key: 'category',
      href: buildCatalogueHref(currentFilters, { category: undefined }),
      label: currentFilters.category,
    });
  }
  if (currentFilters.year) {
    chips.push({
      key: 'year',
      href: buildCatalogueHref(currentFilters, { year: undefined }),
      label: String(currentFilters.year),
    });
  }
  if (currentFilters.availability && currentFilters.availability !== 'all') {
    chips.push({
      key: 'availability',
      href: buildCatalogueHref(currentFilters, { availability: undefined }),
      label: AVAILABILITY_LABELS[currentFilters.availability] ?? currentFilters.availability,
    });
  }

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={chip.href}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
        >
          {chip.label}
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      ))}
      <Link
        href="/catalogue"
        className="text-sm font-medium text-slate-500 underline-offset-2 hover:text-primary hover:underline"
      >
        Tout effacer
      </Link>
    </div>
  );
}
