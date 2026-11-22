import Link from 'next/link';
import { BookmarkX } from 'lucide-react';
import type { ReactElement } from 'react';
import { requireActiveDashboardUser } from '@/lib/dashboard-access';
import { prisma } from '@/lib/prisma';
import { reservationSelect } from '@/lib/circulation';
import { ReservationCard } from '@/components/dashboard/ReservationCard';
import { CirculationNotice } from '@/components/shared/CirculationNotice';
import { isCirculationReachable } from '@/lib/circulation-status';

export const dynamic = 'force-dynamic';

export default async function ReservationsPage(): Promise<ReactElement> {
  // Avant toute lecture : le layout s'exécute en parallèle et ne protège pas seul.
  const user = await requireActiveDashboardUser();

  const reachable = await isCirculationReachable();
  const reservations = await prisma.reservation.findMany({
    where: { userId: user.id },
    select: reservationSelect,
    orderBy: { requestDate: 'desc' },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-primary">Mes réservations</h1>
        <p className="mt-1 text-sm text-slate-500">Suivez vos réservations et votre place sur liste d&rsquo;attente.</p>
      </div>

      {reachable ? null : <CirculationNotice />}

      {reservations.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <BookmarkX className="h-7 w-7" aria-hidden="true" />
          </span>
          <p className="font-medium text-primary">Vous n&rsquo;avez aucune réservation.</p>
          <Link href="/catalogue" className="text-sm font-medium text-primary hover:underline">
            Parcourir le catalogue
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {reservations.map((reservation) => (
            <ReservationCard key={reservation.id} reservation={reservation} />
          ))}
        </div>
      )}
    </div>
  );
}
