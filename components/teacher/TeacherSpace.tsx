import Link from 'next/link';
import { Info } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { TEACHER_NO_DEPARTMENT_MESSAGE } from '@/lib/constants';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/enseignant/listes', label: 'Mes listes de lectures' },
  { href: '/enseignant/propositions', label: 'Mes propositions d’acquisition' },
];

/** En-tête commun des pages de l'espace enseignant (titre et onglets). */
export function TeacherSpace({ title, description, active, children }: { title: string; description: string; active: string; children: ReactNode }): ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-primary">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <nav aria-label="Espace enseignant" className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
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
      </div>
      {children}
    </div>
  );
}

/** Enseignant sans département officiel : rien ne peut être créé. */
export function NoDepartmentNotice(): ReactElement {
  return (
    <div role="status" className="flex items-start gap-3 rounded-xl border border-secondary/40 bg-secondary/10 px-4 py-4 text-sm text-slate-700">
      <Info className="mt-0.5 h-5 w-5 shrink-0 text-secondary" aria-hidden="true" />
      <p>{TEACHER_NO_DEPARTMENT_MESSAGE}</p>
    </div>
  );
}

/** Carte blanche standard des listes et formulaires. */
export function Panel({ title, children, className }: { title?: string; children: ReactNode; className?: string }): ReactElement {
  return (
    <section className={cn('flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6', className)}>
      {title ? <h2 className="font-serif text-lg font-semibold text-primary">{title}</h2> : null}
      {children}
    </section>
  );
}
