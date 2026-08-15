import type { ReactElement, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

export function SectionHeading({ eyebrow, title, subtitle, action, className }: SectionHeadingProps): ReactElement {
  return (
    <div className={cn('flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div>
        {eyebrow ? <p className="mb-2 text-sm font-semibold uppercase tracking-[0.25em] text-secondary">{eyebrow}</p> : null}
        <h2 className="font-serif text-3xl font-semibold text-primary sm:text-4xl">{title}</h2>
        {subtitle ? <p className="mt-2 max-w-2xl text-slate-600">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
