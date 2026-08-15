'use client';

import { useSession } from 'next-auth/react';
import { useState } from 'react';
import type { ReactElement } from 'react';
import type { ReservationStatus } from '@prisma/client';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/utils';
import type { ApiResponse } from '@/types';

interface BookActionsProps {
  bookId: string;
  availableCopies: number;
  initialReservationStatus: ReservationStatus | null;
  initialLoanDueDate: string | null;
}

interface FeedbackState {
  type: 'success' | 'error';
  message: string;
}

export function BookActions({
  bookId,
  availableCopies,
  initialReservationStatus,
  initialLoanDueDate,
}: BookActionsProps): ReactElement {
  const { status: sessionStatus } = useSession();
  const [reservationStatus, setReservationStatus] = useState<ReservationStatus | null>(initialReservationStatus);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  if (sessionStatus === 'loading') {
    return <div className="h-12 w-full max-w-xs animate-pulse rounded-lg bg-slate-100" />;
  }

  if (sessionStatus !== 'authenticated') {
    return (
      <Button href="/connexion" variant="primary" size="md" className="w-full sm:w-auto">
        Se connecter pour réserver
      </Button>
    );
  }

  if (initialLoanDueDate) {
    return (
      <p className="rounded-lg bg-primary/5 px-4 py-3 text-sm text-primary">
        Vous avez emprunté cet ouvrage. Date de retour : <strong>{formatDate(initialLoanDueDate)}</strong>
      </p>
    );
  }

  if (reservationStatus) {
    return (
      <p className="rounded-lg bg-secondary/10 px-4 py-3 text-sm text-secondary">
        {reservationStatus === 'READY'
          ? 'Votre exemplaire est prêt à être récupéré.'
          : 'Vous avez déjà réservé ce livre — vous êtes sur liste d’attente.'}
      </p>
    );
  }

  async function handleReserve(): Promise<void> {
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const response = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId }),
      });
      const payload = (await response.json()) as ApiResponse<{ status: ReservationStatus }>;

      if (!response.ok || !payload.success || !payload.data) {
        setFeedback({ type: 'error', message: payload.message ?? 'Impossible de réserver ce livre.' });
        return;
      }

      setReservationStatus(payload.data.status);
      setFeedback({ type: 'success', message: 'Réservation effectuée avec succès.' });
    } catch {
      setFeedback({ type: 'error', message: 'Une erreur réseau est survenue. Réessayez.' });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        variant={availableCopies > 0 ? 'primary' : 'outline'}
        size="md"
        onClick={handleReserve}
        disabled={isSubmitting}
        className="w-full sm:w-auto"
      >
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {availableCopies > 0 ? 'Réserver' : 'Rejoindre la liste d’attente'}
      </Button>

      {feedback ? (
        <p
          role="status"
          className={`flex items-center gap-2 text-sm ${feedback.type === 'success' ? 'text-success' : 'text-danger'}`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}
