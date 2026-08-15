import Link from 'next/link';
import type { ReactElement, ReactNode } from 'react';
import type { CatalogueMetadata } from '@/lib/catalogue-data';
import { buildCatalogueHref, type CatalogueFilterValues } from '@/lib/catalogue-url';
import { cn } from '@/lib/utils';

interface FilterChipsProps {
  metadata: CatalogueMetadata;
  currentFilters: CatalogueFilterValues;
}

const AVAILABILITY_OPTIONS: { value: 'all' | 'available' | 'unavailable'; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'available', label: 'Disponible' },
  { value: 'unavailable', label: 'Indisponible' },
];

function ChipGroup({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: ReactNode }): ReactElement {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
        active ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      )}
    >
      {children}
    </Link>
  );
}

export function FilterChips({ metadata, currentFilters }: FilterChipsProps): ReactElement {
  return (
    <div className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5">
      <ChipGroup label="Département">
        <Chip href={buildCatalogueHref(currentFilters, { department: undefined })} active={!currentFilters.department}>
          Tous
        </Chip>
        {metadata.departments.map((department) => (
          <Chip
            key={department}
            href={buildCatalogueHref(currentFilters, { department })}
            active={currentFilters.department === department}
          >
            {department}
          </Chip>
        ))}
      </ChipGroup>

      <ChipGroup label="Catégorie">
        <Chip href={buildCatalogueHref(currentFilters, { category: undefined })} active={!currentFilters.category}>
          Toutes
        </Chip>
        {metadata.categories.map((category) => (
          <Chip
            key={category}
            href={buildCatalogueHref(currentFilters, { category })}
            active={currentFilters.category === category}
          >
            {category}
          </Chip>
        ))}
      </ChipGroup>

      <ChipGroup label="Année">
        <Chip href={buildCatalogueHref(currentFilters, { year: undefined })} active={!currentFilters.year}>
          Toutes
        </Chip>
        {metadata.years.map((year) => (
          <Chip key={year} href={buildCatalogueHref(currentFilters, { year })} active={currentFilters.year === year}>
            {year}
          </Chip>
        ))}
      </ChipGroup>

      <ChipGroup label="Disponibilité">
        {AVAILABILITY_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            href={buildCatalogueHref(currentFilters, {
              availability: option.value === 'all' ? undefined : option.value,
            })}
            active={(currentFilters.availability ?? 'all') === option.value}
          >
            {option.label}
          </Chip>
        ))}
      </ChipGroup>
    </div>
  );
}
