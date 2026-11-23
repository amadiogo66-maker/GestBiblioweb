import { AlertTriangle, Ban, Clock, GraduationCap, PauseCircle, UserCheck, UserRound, Users } from 'lucide-react';
import type { ReactElement } from 'react';
import { redirect } from 'next/navigation';
import { StatCard } from '@/components/dashboard/StatCard';
import { AccountsTable } from '@/components/staff/AccountsTable';
import { AuditTable } from '@/components/staff/AuditTable';
import { requireStaffPage } from '@/lib/staff-page';
import { getStaffDashboardData } from '@/lib/staff-data';
import { STAFF_RECENT_ACTIONS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

function Section({ title, description, children }: { title: string; description?: string; children: ReactElement }): ReactElement {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-serif text-lg font-semibold text-primary">{title}</h2>
        {description ? <p className="text-sm text-slate-500">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default async function StaffDashboardPage(): Promise<ReactElement> {
  const context = await requireStaffPage();

  // Responsable de département seul : son espace, pas les comptes du site.
  if (!context.isLibraryStaff) {
    redirect('/personnel/departement');
  }

  const data = await getStaffDashboardData();
  const count = (record: Record<string, number>, key: string): number => record[key] ?? 0;

  return (
    <>
      <div>
        <h1 className="font-serif text-2xl font-semibold text-primary">Tableau de bord</h1>
        <p className="mt-1 text-sm text-slate-500">Vue d&rsquo;ensemble des comptes du site.</p>
      </div>

      <Section title="Comptes par statut">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={UserCheck} label="Actifs" value={count(data.byStatus, 'ACTIVE')} href="/personnel/comptes?status=ACTIVE" />
          <StatCard icon={PauseCircle} label="Suspendus" value={count(data.byStatus, 'SUSPENDED')} href="/personnel/comptes?status=SUSPENDED" />
          <StatCard icon={Ban} label="Bannis" value={count(data.byStatus, 'BANNED')} href="/personnel/comptes?status=BANNED" />
          <StatCard icon={Clock} label="En attente" value={count(data.byStatus, 'PENDING')} href="/personnel/comptes?status=PENDING" />
        </div>
      </Section>

      <Section title="Comptes par rôle">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard icon={GraduationCap} label="Étudiants" value={count(data.byRole, 'STUDENT')} href="/personnel/comptes?role=STUDENT" />
          <StatCard icon={Users} label="Enseignants" value={count(data.byRole, 'TEACHER')} href="/personnel/comptes?role=TEACHER" />
          <StatCard icon={UserRound} label="Visiteurs" value={count(data.byRole, 'VISITOR')} href="/personnel/comptes?role=VISITOR" />
        </div>
      </Section>

      <Section
        title={`Incohérences à traiter (${data.inconsistentCount})`}
        description="Comptes actifs dont l'inscription à la bibliothèque est inactive ou expirée (10 premiers)."
      >
        <AccountsTable accounts={data.inconsistent} emptyMessage="Aucune incohérence." />
      </Section>

      <Section
        title={`Suspensions automatiques (${data.autoSuspendedCount})`}
        description="Comptes suspendus par la synchronisation (inscription inactive) — levées automatiquement à la régularisation (10 premiers)."
      >
        <AccountsTable accounts={data.autoSuspended} emptyMessage="Aucune suspension automatique." />
      </Section>

      <Section title={`Dernières actions du personnel (${STAFF_RECENT_ACTIONS} au plus)`}>
        <AuditTable entries={data.recentActions} labels={data.labels} emptyMessage="Aucune action du personnel pour le moment." />
      </Section>

      <p className="flex items-center gap-2 text-xs text-slate-500">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        Les attributions de rôles du personnel se font uniquement par le script d&rsquo;administration.
      </p>
    </>
  );
}
