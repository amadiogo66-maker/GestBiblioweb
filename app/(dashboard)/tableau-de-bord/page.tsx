import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Bell, Bookmark, BookMarked } from 'lucide-react';
import type { ReactElement } from 'react';
import { auth } from '@/lib/auth';
import { canRequestRenewal } from '@/lib/circulation';
import { getDashboardOverview } from '@/lib/dashboard-data';
import { StatCard } from '@/components/dashboard/StatCard';
import { LoanCard } from '@/components/dashboard/LoanCard';
import { ReservationCard } from '@/components/dashboard/ReservationCard';
import { Button } from '@/components/ui/Button';

export const dynamic = 'force-dynamic';

export default async function TableauDeBordPage(): Promise<ReactElement> {
  const session = await auth();

  if (!session?.user) {
    redirect('/connexion');
  }

  const { stats, recentLoans, recentReservations } = await getDashboardOverview(session.user.id);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-primary">Bonjour, {session.user.firstName}</h1>
        <p className="mt-1 text-sm text-slate-500">Voici un aperçu de votre espace personnel.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={BookMarked} label="Emprunts actifs" value={stats.activeLoans} href="/emprunts" />
        <StatCard icon={Bookmark} label="Réservations en attente" value={stats.pendingReservations} href="/reservations" />
        <StatCard icon={Bell} label="Notifications non lues" value={stats.unreadNotifications} href="/profil" />
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold text-primary">Emprunts à rendre bientôt</h2>
          <Link href="/emprunts" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            Tout voir
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
        {recentLoans.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
            Aucun emprunt en cours.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {recentLoans.map((loan) => (
              <LoanCard key={loan.id} loan={loan} canRenew={canRequestRenewal(loan)} />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold text-primary">Réservations en cours</h2>
          <Link href="/reservations" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            Tout voir
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
        {recentReservations.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
            Aucune réservation en cours.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {recentReservations.map((reservation) => (
              <ReservationCard key={reservation.id} reservation={reservation} />
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-3">
        <Button href="/catalogue" variant="primary" size="md">
          Consulter le catalogue
        </Button>
        <Button href="/profil" variant="outline" size="md">
          Voir ma carte de bibliothèque
        </Button>
      </div>
    </div>
  );
}
