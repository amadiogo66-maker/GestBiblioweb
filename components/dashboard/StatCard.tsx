import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import type { ReactElement } from 'react';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: number;
  href: string;
}

export function StatCard({ icon: Icon, label, value, href }: StatCardProps): ReactElement {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <div>
        <p className="text-2xl font-semibold text-primary">{value}</p>
        <p className="text-sm text-slate-500">{label}</p>
      </div>
    </Link>
  );
}
