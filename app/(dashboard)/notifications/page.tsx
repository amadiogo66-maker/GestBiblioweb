import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BellOff } from 'lucide-react';
import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { MarkAllReadButton } from '@/components/dashboard/NotificationActions';
import { NotificationItem } from '@/components/dashboard/NotificationItem';
import { Pagination } from '@/components/shared/Pagination';
import { auth } from '@/lib/auth';
import { requireActiveDashboardUser } from '@/lib/dashboard-access';
import { buildListHref } from '@/lib/list-url';
import { listUserNotifications } from '@/lib/notifications-data';
import { cn } from '@/lib/utils';
import { notificationsPageSchema } from '@/schemas/notification';
import { flattenSearchParams } from '@/schemas/staff';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Mes notifications - Gest Biblio',
};

interface NotificationsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const FILTERS = [
  { value: 'all', label: 'Toutes' },
  { value: 'unread', label: 'Non lues' },
] as const;

export default async function NotificationsPage({ searchParams }: NotificationsPageProps): Promise<ReactElement> {
  const session = await auth();

  if (!session?.user) {
    redirect('/connexion');
  }

  await requireActiveDashboardUser(session.user.id);

  const query = notificationsPageSchema.parse(flattenSearchParams(await searchParams));
  const { notifications, page, total, totalPages, unreadCount } = await listUserNotifications(session.user.id, query);
  const filterParam = query.filter === 'unread' ? 'unread' : undefined;
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-primary">Mes notifications</h1>
          <p className="mt-1 text-sm text-slate-500">
            {unreadCount === 0
              ? 'Vous êtes à jour.'
              : `${unreadCount} notification${unreadCount > 1 ? 's' : ''} non lue${unreadCount > 1 ? 's' : ''}.`}
          </p>
        </div>
        {unreadCount > 0 ? <MarkAllReadButton /> : null}
      </div>

      <div className="flex gap-2">
        {FILTERS.map((item) => (
          <Link
            key={item.value}
            href={buildListHref('/notifications', { filter: item.value === 'unread' ? 'unread' : undefined })}
            aria-current={query.filter === item.value ? 'page' : undefined}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              query.filter === item.value ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {notifications.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <BellOff className="h-7 w-7" aria-hidden="true" />
          </span>
          <p className="font-serif text-lg font-semibold text-primary">
            {query.filter === 'unread' ? 'Aucune notification non lue.' : 'Aucune notification pour le moment.'}
          </p>
          <p className="text-sm text-slate-500">
            Vous serez prévenu ici lorsqu&rsquo;une réservation sera prête ou qu&rsquo;un emprunt arrivera à échéance.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {notifications.map((notification) => (
            <NotificationItem key={notification.id} notification={notification} now={now} />
          ))}
        </ul>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        buildHref={(target) => buildListHref('/notifications', { filter: filterParam, page: target })}
      />
    </div>
  );
}
