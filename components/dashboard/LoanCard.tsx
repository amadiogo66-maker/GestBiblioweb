'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { AlertCircle, BookOpen, CheckCircle2, RefreshCw } from 'lucide-react';
import type { LoanWithBook } from '@/lib/circulation';
import type { ApiResponse } from '@/types';
import { ImageWithFallback } from '@/components/shared/ImageWithFallback';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/utils';

interface LoanCardProps {
  loan: LoanWithBook;
  canRenew: boolean;
}

interface FeedbackState {
  type: 'success' | 'error';
  message: string;
}

const STATUS_LABELS: Record<string, { label: string; variant: 'success' | 'danger' | 'neutral' | 'primary' }> = {
  ACTIVE: { label: 'En cours', variant: 'primary' },
  RETURNED: { label: 'Rendu', variant: 'success' },
  OVERDUE: { label: 'En retard', variant: 'danger' },
  LOST: { label: 'Perdu', variant: 'danger' },
};

export function LoanCard({ loan, canRenew }: LoanCardProps): ReactElement {
  const [dueDate, setDueDate] = useState<Date | string>(loan.dueDate);
  const [renewalCount, setRenewalCount] = useState(loan.renewalCount);
  const [isRenewed, setIsRenewed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  const statusInfo = STATUS_LABELS[loan.status] ?? { label: loan.status, variant: 'neutral' as const };

  async function handleRenew(): Promise<void> {
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const response = await fetch(`/api/loans/${loan.id}/renew`, { method: 'PATCH' });
      const payload = (await response.json()) as ApiResponse<{ dueDate: string; renewalCount: number }>;

      if (!response.ok || !payload.success || !payload.data) {
        setFeedback({ type: 'error', message: payload.message ?? 'Impossible de renouveler cet emprunt.' });
        return;
      }

      setDueDate(payload.data.dueDate);
      setRenewalCount(payload.data.renewalCount);
      setIsRenewed(true);
      setFeedback({ type: 'success', message: 'Emprunt renouvelé avec succès.' });
    } catch {
      setFeedback({ type: 'error', message: 'Une erreur réseau est survenue. Réessayez.' });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
      <Link href={`/ouvrage/${loan.book.id}`} className="shrink-0">
        <ImageWithFallback
          src={loan.book.coverImage}
          alt={`Couverture de ${loan.book.title}`}
          className="h-24 w-16 rounded-lg"
          fallback={<BookOpen className="h-6 w-6 text-primary/40" aria-hidden="true" />}
        />
      </Link>

      <div className="flex flex-1 flex-col gap-1">
        <Link
          href={`/ouvrage/${loan.book.id}`}
          className="font-serif text-base font-semibold text-primary hover:underline"
        >
          {loan.book.title}
        </Link>
        <p className="text-sm text-slate-500">{loan.book.author}</p>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          <span>Emprunté le {formatDate(loan.borrowDate)}</span>
          <span>
            À rendre le <strong className="text-primary">{formatDate(dueDate)}</strong>
          </span>
          {renewalCount > 0 ? <span>{renewalCount} renouvellement(s)</span> : null}
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

      {canRenew && !isRenewed ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRenew}
          disabled={isSubmitting}
          className="shrink-0"
        >
          <RefreshCw className={`h-4 w-4 ${isSubmitting ? 'animate-spin' : ''}`} aria-hidden="true" />
          Renouveler
        </Button>
      ) : null}
    </div>
  );
}
