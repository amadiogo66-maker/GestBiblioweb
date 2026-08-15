'use client';

import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Button } from '@/components/ui/Button';
import { buildCatalogueHref, type CatalogueFilterValues } from '@/lib/catalogue-url';

interface SearchBarProps {
  defaultQuery: string;
  currentFilters: CatalogueFilterValues;
}

export function SearchBar({ defaultQuery, currentFilters }: SearchBarProps): ReactElement {
  const router = useRouter();
  const [value, setValue] = useState(defaultQuery);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    router.push(buildCatalogueHref(currentFilters, { query: value.trim() || undefined }));
  }

  return (
    <form
      onSubmit={handleSubmit}
      role="search"
      className="flex w-full flex-col gap-3 rounded-xl bg-white p-3 shadow-lg sm:flex-row"
    >
      <label htmlFor="catalogue-search" className="sr-only">
        Rechercher par titre, auteur, ISBN
      </label>
      <div className="relative flex-1">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <input
          id="catalogue-search"
          type="search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Rechercher par titre, auteur, ISBN..."
          className="w-full rounded-lg border-0 py-3 pl-11 pr-4 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
      <Button type="submit" variant="primary" size="md" className="shrink-0">
        Rechercher
      </Button>
    </form>
  );
}
