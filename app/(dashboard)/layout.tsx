import type { ReactElement, ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DashboardNav } from '@/components/dashboard/DashboardNav';
import { Container } from '@/components/ui/Container';

interface DashboardLayoutProps {
  children: ReactNode;
}

export default async function DashboardLayout({ children }: DashboardLayoutProps): Promise<ReactElement> {
  const session = await auth();

  if (!session?.user) {
    redirect('/connexion');
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
