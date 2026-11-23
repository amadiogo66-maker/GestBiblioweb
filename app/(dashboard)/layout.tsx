import type { ReactElement, ReactNode } from 'react';
import { requireActiveDashboardUser } from '@/lib/dashboard-access';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DashboardNav } from '@/components/dashboard/DashboardNav';
import { Container } from '@/components/ui/Container';

interface DashboardLayoutProps {
  children: ReactNode;
}

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: DashboardLayoutProps): Promise<ReactElement> {
  // Même lecture du compte que la page (cache de requête).
  const user = await requireActiveDashboardUser();

  return (
    <div className="min-h-screen bg-accent">
      <DashboardHeader firstName={user.firstName} showStaffLink={user.hasStaffAccess} />
      <DashboardNav showTeacherLink={user.role === 'TEACHER'} />
      <main className="py-10">
        <Container className="flex flex-col gap-8">{children}</Container>
      </main>
    </div>
  );
}
