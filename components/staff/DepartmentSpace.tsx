import Link from 'next/link';
import type { ReactElement, ReactNode } from 'react';
import { buildListHref } from '@/lib/list-url';
import { cn } from '@/lib/utils';
import type { ScopedDepartment } from '@/lib/department-scope';

const TABS = [
  { href: '/personnel/departement', label: 'Tableau de bord' },
  { href: '/personnel/departement/propositions', label: 'Propositions' },
  { href: '/personnel/departement/listes', label: 'Listes de lectures' },
];

interface DepartmentSpaceProps {
  active: string;
  selected: ScopedDepartment | null;
  options: ScopedDepartment[];
  children: ReactNode;
}

/** En-tête de l'espace département : choix du département puis onglets. */
export function DepartmentSpace({ active, selected, options, children }: DepartmentSpaceProps): ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-primary">{selected ? selected.name : 'Espace département'}</h1>
          <p className="mt-1 text-sm text-slate-500">Données agrégées du département : aucune donnée individuelle d&rsquo;emprunt ni de réservation.</p>
        </div>
        {selected ? (
          <nav aria-label="Espace département" className="flex flex-wrap gap-2">
            {TABS.map((tab) => (
              <Link
                key={tab.href}
                href={buildListHref(tab.href, { departement: selected.slug })}
                aria-current={active === tab.href ? 'page' : undefined}
                className={cn(
                  'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                  active === tab.href ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>

      {options.length > 1 ? (
        <form method="get" className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-1">
            <label htmlFor="dept-choice" className="text-xs font-medium text-slate-600">
              Département
            </label>
            <select
              id="dept-choice"
              name="departement"
              defaultValue={selected?.slug ?? ''}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="" disabled>
                Choisir…
              </option>
              {options.map((option) => (
                <option key={option.id} value={option.slug}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded-lg border border-primary/30 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/5">
            Afficher
          </button>
        </form>
      ) : null}

      {selected ? (
        children
      ) : options.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun département ne vous est affecté.</p>
      ) : (
        <p className="text-sm text-slate-500">Choisissez un département.</p>
      )}
    </div>
  );
}
