import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LoanStatus, type Prisma } from '@prisma/client';
import { BookX } from 'lucide-react';
import type { ReactElement } from 'react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canRequestRenewal, loanSelect } from '@/lib/circulation';
import { LoanCard } from '@/components/dashboard/LoanCard';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type LoanFilter = 'all' | 'active' | 'history';

const STATUS_FILTERS: { value: LoanFilter; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'active', label: 'En cours' },
  { value: 'history', label: 'Historique' },
];

interface EmpruntsPageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function EmpruntsPage({ searchParams }: EmpruntsPageProps): Promise<ReactElement> {
  const session = await auth();

  if (!session?.user) {
    redirect('/connexion');
  }

  const { status } = await searchParams;
  const filter: LoanFilter = status === 'active' || status === 'history' ? status : 'all';

  const statusFilter: Prisma.LoanWhereInput =
    filter === 'active'
      ? { status: { in: [LoanStatus.ACTIVE, LoanStatus.OVERDUE] } }
      : filter === 'history'
        ? { status: { in: [LoanStatus.RETURNED, LoanStatus.LOST] } }
        : {};

  const loans = await prisma.loan.findMany({
    where: { userId: session.user.id, ...statusFilter },
    select: loanSelect,
    orderBy: { borrowDate: 'desc' },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-primary">Mes emprunts</h1>
        <p className="mt-1 text-sm text-slate-500">Consultez et renouvelez vos emprunts.</p>
      </div>

      <div className="flex gap-2">
        {STATUS_FILTERS.map((item) => (
          <Link
            key={item.value}
            href={item.value === 'all' ? '/emprunts' : `/emprunts?status=${item.value}`}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              filter === item.value ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {loans.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <BookX className="h-7 w-7" aria-hidden="true" />
          </span>
          <p className="font-medium text-primary">
            {filter === 'history' ? "Aucun emprunt dans l'historique." : 'Aucun emprunt en cours.'}
          </p>
          <Link href="/catalogue" className="text-sm font-medium text-primary hover:underline">
            Parcourir le catalogue
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {loans.map((loan) => (
            <LoanCard key={loan.id} loan={loan} canRenew={canRequestRenewal(loan)} />
          ))}
        </div>
      )}
    </div>
  );
}
