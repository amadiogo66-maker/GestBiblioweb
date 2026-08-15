import { BookStatus } from '@prisma/client';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import type { ReactElement } from 'react';

interface AvailabilityBadgeProps {
  availableCopies: number;
  totalCopies: number;
  status: BookStatus;
}

export function AvailabilityBadge({ availableCopies, totalCopies, status }: AvailabilityBadgeProps): ReactElement {
  if (availableCopies > 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-success/10 px-4 py-3 text-success">
        <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
        <p className="text-sm font-medium">
          Disponible — {availableCopies} exemplaire{availableCopies > 1 ? 's' : ''} sur {totalCopies}
        </p>
      </div>
    );
  }

  if (status === BookStatus.RESERVED) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-warning/10 px-4 py-3 text-warning">
        <Clock className="h-5 w-5 shrink-0" aria-hidden="true" />
        <p className="text-sm font-medium">Réservé — Sur liste d&rsquo;attente</p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg bg-danger/10 px-4 py-3 text-danger">
      <XCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
      <p className="text-sm font-medium">Indisponible — Tous les exemplaires sont empruntés</p>
    </div>
  );
}
