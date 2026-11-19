import type { ReactElement, ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DashboardNav } from '@/components/dashboard/DashboardNav';
import { Container } from '@/components/ui/Container';
import { BLOCKED_ACCOUNT_ROUTE } from '@/lib/constants';

interface DashboardLayoutProps {
  children: ReactNode;
}

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: DashboardLayoutProps): Promise<ReactElement> {
  const session = await auth();

  if (!session?.user) {
    redirect('/connexion');
  }

  // One database lookup at the shared dashboard layout boundary per navigation.
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { status: true } });

  // Compte bloqué ou supprimé mais session encore valide : page publique dédiée
  // (rediriger vers /connexion bouclerait, le middleware y renvoyant tout
  // utilisateur en session vers /tableau-de-bord).
  if (!user || user.status !== 'ACTIVE') {
    redirect(user?.status === 'PENDING' ? '/en-attente-validation' : BLOCKED_ACCOUNT_ROUTE);
  }

  return (
    <div className="min-h-screen bg-accent">
      <DashboardHeader firstName={session.user.firstName} />
      <DashboardNav />
      <main className="py-10">
        <Container className="flex flex-col gap-8">{children}</Container>
      </main>
    </div>
  );
}
