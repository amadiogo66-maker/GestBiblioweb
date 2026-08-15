'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { AlertCircle, BookOpen, CheckCircle2, X } from 'lucide-react';
import type { ReservationWithBook } from '@/lib/circulation';
import type { ApiResponse } from '@/types';
import { ImageWithFallback } from '@/components/shared/ImageWithFallback';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/utils';

interface ReservationCardProps {
  reservation: ReservationWithBook;
}

interface FeedbackState {
  type: 'success' | 'error';
  message: string;
}

const STATUS_LABELS: Record<string, { label: string; variant: 'success' | 'danger' | 'neutral' | 'primary' | 'new' }> = {
  PENDING: { label: "Liste d'attente", variant: 'neutral' },
  READY: { label: 'Prête à récupérer', variant: 'success' },
  EXPIRED: { label: 'Expirée', variant: 'danger' },
  CANCELLED: { label: 'Annulée', variant: 'neutral' },
  FULFILLED: { label: 'Récupérée', variant: 'primary' },
};

export function ReservationCard({ reservation }: ReservationCardProps): ReactElement {
  const [status, setStatus] = useState(reservation.status);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  const statusInfo = STATUS_LABELS[status] ?? { label: status, variant: 'neutral' as const };
  const canCancel = status === 'PENDING' || status === 'READY';

  async function handleCancel(): Promise<void> {
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const response = await fetch(`/api/reservations/${reservation.id}/cancel`, { method: 'PATCH' });
      const payload = (await response.json()) as ApiResponse<{ status: string }>;

      if (!response.ok || !payload.success || !payload.data) {
        setFeedback({ type: 'error', message: payload.message ?? 'Impossible d’annuler cette réservation.' });
        return;
      }

      setStatus('CANCELLED');
      setFeedback({ type: 'success', message: 'Réservation annulée.' });
    } catch {
      setFeedback({ type: 'error', message: 'Une erreur réseau est survenue. Réessayez.' });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
      <Link href={`/ouvrage/${reservation.book.id}`} className="shrink-0">
        <ImageWithFallback
          src={reservation.book.coverImage}
          alt={`Couverture de ${reservation.book.title}`}
          className="h-24 w-16 rounded-lg"
          fallback={<BookOpen className="h-6 w-6 text-primary/40" aria-hidden="true" />}
        />
      </Link>

      <div className="flex flex-1 flex-col gap-1">
        <Link
          href={`/ouvrage/${reservation.book.id}`}
          className="font-serif text-base font-semibold text-primary hover:underline"
        >
          {reservation.book.title}
        </Link>
        <p className="text-sm text-slate-500">{reservation.book.author}</p>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          <span>Réservé le {formatDate(reservation.requestDate)}</span>
          {reservation.expiryDate ? <span>Expire le {formatDate(reservation.expiryDate)}</span> : null}
        </div>
        {feedback ? (
          <p
            role="status"
            className={`mt-1 flex items-center gap-1.5 text-xs ${feedback.type === 'success' ? 'text-success' : 'text-danger'}`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            {feedback.message}
          </p>
        ) : null}
      </div>

      {canCancel ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCancel}
          disabled={isSubmitting}
          className="shrink-0"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Annuler
        </Button>
      ) : null}
    </div>
  );
}
