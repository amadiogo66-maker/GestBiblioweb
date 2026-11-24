import Link from 'next/link';
import { ArrowRight, Bell, Bookmark, BookMarked } from 'lucide-react';
import type { ReactElement } from 'react';
import { requireActiveDashboardUser } from '@/lib/dashboard-access';
import { canRequestRenewal } from '@/lib/circulation';
import { getDashboardOverview } from '@/lib/dashboard-data';
import { readingListsForDepartment } from '@/lib/reading-lists';
import { StatCard } from '@/components/dashboard/StatCard';
import { LoanCard } from '@/components/dashboard/LoanCard';
import { ReservationCard } from '@/components/dashboard/ReservationCard';
import { Button } from '@/components/ui/Button';

export const dynamic = 'force-dynamic';

export default async function TableauDeBordPage(): Promise<ReactElement> {
  // Avant toute lecture : le layout s'exécute en parallèle et ne protège pas seul.
  const user = await requireActiveDashboardUser();

  // Département relu en base par le garde ; « Pour vous » = UNE requête, seulement s'il est connu.
  const [{ stats, recentLoans, recentReservations }, listsForYou] = await Promise.all([
    getDashboardOverview(user.id),
    user.departmentId ? readingListsForDepartment(user.departmentId) : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-primary">Bonjour, {user.firstName}</h1>
        <p className="mt-1 text-sm text-slate-500">Voici un aperçu de votre espace personnel.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={BookMarked} label="Emprunts actifs" value={stats.activeLoans} href="/emprunts" />
        <StatCard icon={Bookmark} label="Réservations en attente" value={stats.pendingReservations} href="/reservations" />
        <StatCard icon={Bell} label="Notifications non lues" value={stats.unreadNotifications} href="/notifications" />
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

      {listsForYou.length > 0 ? (
        <section className="flex flex-col gap-4" aria-labelledby="pour-vous">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="pour-vous" className="font-serif text-lg font-semibold text-primary">
              Listes de lecture pour vous
            </h2>
            <Link href="/listes-de-lecture" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Voir toutes les listes
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {listsForYou.map((list) => (
              <li key={list.id}>
                <Link
                  href={`/listes-de-lecture/${list.id}`}
                  className="flex h-full flex-col gap-1 rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-md"
                >
                  <p className="font-medium text-primary">{list.title}</p>
                  {list.courseCode ? <p className="text-sm text-slate-600">{list.courseCode}</p> : null}
                  <p className="mt-auto text-xs text-slate-500">
                    {list.itemCount} ouvrage{list.itemCount > 1 ? 's' : ''}
                    {list.teacherName ? ` · ${list.teacherName}` : ''}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
