import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps): ReactElement {
  return (
    <div className="w-full rounded-2xl bg-white p-6 shadow-xl sm:p-10">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Retour à l&rsquo;accueil
      </Link>
      <h1 className="font-serif text-2xl font-semibold text-primary">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      <div className="mt-6">{children}</div>
    </div>
  );
}
