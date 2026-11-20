'use client';

import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { LogOut, ShieldCheck } from 'lucide-react';
import type { ReactElement } from 'react';
import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { APP_NAME } from '@/lib/constants';

interface DashboardHeaderProps {
  firstName: string;
  /** Calculé côté serveur à partir des affectations actives en base. */
  showStaffLink?: boolean;
}

export function DashboardHeader({ firstName, showStaffLink = false }: DashboardHeaderProps): ReactElement {
  return (
    <header className="border-b border-slate-200 bg-white">
      <Container className="flex h-16 items-center justify-between">
        <Link href="/" className="font-serif text-lg font-semibold text-primary">
          {APP_NAME}
        </Link>
        <div className="flex items-center gap-2 sm:gap-4">
          <span className="hidden text-sm text-slate-600 sm:inline">
            Bonjour, <strong className="text-primary">{firstName}</strong>
          </span>
          {showStaffLink ? (
            <Button href="/personnel" variant="ghost" size="sm" aria-label="Espace du personnel">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Espace du personnel</span>
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={() => signOut({ callbackUrl: '/' })}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Déconnexion
          </Button>
        </div>
      </Container>
    </header>
  );
}
