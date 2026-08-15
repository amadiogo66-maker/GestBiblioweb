import { SearchX } from 'lucide-react';
import type { ReactElement } from 'react';

export function EmptyState(): ReactElement {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white py-20 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <SearchX className="h-7 w-7" aria-hidden="true" />
      </span>
      <p className="font-serif text-lg font-semibold text-primary">Aucun ouvrage ne correspond à votre recherche.</p>
      <p className="text-sm text-slate-500">Essayez avec d'autres critères.</p>
    </div>
  );
}
