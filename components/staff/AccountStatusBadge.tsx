import type { ReactElement } from 'react';
import { Badge } from '@/components/ui/Badge';
import { ACCOUNT_STATUS_BADGE, ACCOUNT_STATUS_LABELS, type AccountStatusValue } from '@/lib/staff-labels';

export function AccountStatusBadge({ status }: { status: AccountStatusValue }): ReactElement {
  return <Badge variant={ACCOUNT_STATUS_BADGE[status]}>{ACCOUNT_STATUS_LABELS[status]}</Badge>;
}
