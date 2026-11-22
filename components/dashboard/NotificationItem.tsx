import type { ReactElement } from 'react';
import { MarkReadButton } from '@/components/dashboard/NotificationActions';
import { Badge } from '@/components/ui/Badge';
import { formatDateTime } from '@/lib/audit-format';
import { NOTIFICATION_TYPE_LABELS } from '@/lib/notification-labels';
import type { NotificationListItem } from '@/lib/notifications-data';
import { cn, formatRelativeDate } from '@/lib/utils';

/** Le titre et le message sont rendus comme du texte : aucun HTML n'est interprété. */
export function NotificationItem({ notification, now }: { notification: NotificationListItem; now: Date }): ReactElement {
  const type = NOTIFICATION_TYPE_LABELS[notification.type];

  return (
    <li
      className={cn(
        'flex flex-col gap-3 rounded-xl border bg-white p-4 sm:flex-row sm:items-start sm:justify-between',
        notification.isRead ? 'border-slate-200' : 'border-primary/40 border-l-4 border-l-primary'
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={type.variant}>{type.label}</Badge>
          <span className={cn('text-xs font-medium', notification.isRead ? 'text-slate-400' : 'text-primary')}>
            {notification.isRead ? 'Lue' : 'Non lue'}
          </span>
        </div>
        <h2 className={cn('break-words font-serif text-base text-primary', notification.isRead ? 'font-medium' : 'font-semibold')}>
          {notification.title}
        </h2>
        <p className="whitespace-pre-line break-words text-sm text-slate-600">{notification.message}</p>
        <time dateTime={notification.createdAt.toISOString()} className="text-xs text-slate-500">
          {formatRelativeDate(notification.createdAt, now)} · {formatDateTime(notification.createdAt)}
        </time>
      </div>

      {notification.isRead ? null : <MarkReadButton notificationId={notification.id} title={notification.title} />}
    </li>
  );
}
