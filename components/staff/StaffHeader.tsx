import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import type { ReactElement } from 'react';
import { Container } from '@/components/ui/Container';
import { Badge } from '@/components/ui/Badge';
import { APP_NAME } from '@/lib/constants';
import { STAFF_ROLE_LABELS, type StaffRoleValue } from '@/lib/staff-labels';

interface StaffHeaderProps {
  fullName: string;
  roles: readonly StaffRoleValue[];
}

export function StaffHeader({ fullName, roles }: StaffHeaderProps): ReactElement {
  return (
    <header className="border-b border-slate-200 bg-white">
      <Container className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-serif text-lg font-semibold text-primary">
              {APP_NAME} · Espace du personnel
            </p>
            <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              {fullName}
              {roles.map((role) => (
                <Badge key={role} variant={role === 'ADMIN' ? 'primary' : 'neutral'}>
                  {STAFF_ROLE_LABELS[role]}
                </Badge>
              ))}
            </p>
          </div>
        </div>
        <nav className="flex flex-wrap gap-4 text-sm font-medium" aria-label="Quitter l'espace du personnel">
          <Link href="/tableau-de-bord" className="text-primary hover:underline">
            Mon espace
          </Link>
          <Link href="/" className="inline-flex items-center gap-1 text-slate-500 hover:text-primary">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Retour au site
          </Link>
        </nav>
      </Container>
    </header>
  );
}
