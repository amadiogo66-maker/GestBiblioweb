'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Button } from '@/components/ui/Button';
import { AuthError } from '@/components/auth/AuthError';
import { MODERATION_ACTION_LABELS, type ModerationAction } from '@/lib/staff-labels';
import type { ApiResponse } from '@/types';

interface ModerationActionsProps {
  accountId: string;
  accountName: string;
  /** Actions autorisées, calculées côté serveur (l'API revérifie tout). */
  actions: ModerationAction[];
}

const REASON_MIN = 5;
const REASON_MAX = 500;

const CONFIRM_TEXT: Record<ModerationAction, string> = {
  suspend: 'Le compte sera suspendu immédiatement. La synchronisation ne lèvera pas cette suspension.',
  ban: 'Le compte sera banni immédiatement. Seul un administrateur pourra le réactiver.',
  reactivate: 'Le compte retrouvera immédiatement l’accès à son espace personnel.',
};

export function ModerationActions({ accountId, accountName, actions }: ModerationActionsProps): ReactElement | null {
  const router = useRouter();
  const titleId = useId();
  const reasonId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [pending, setPending] = useState<ModerationAction | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!pending) return;

    textareaRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !isSubmitting) setPending(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pending, isSubmitting]);

  if (actions.length === 0) {
    return null;
  }

  function open(action: ModerationAction): void {
    setPending(action);
    setReason('');
    setError(null);
    setSuccess(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!pending) return;

    const trimmed = reason.trim();
    if (trimmed.length < REASON_MIN) {
      setError(`Le motif doit contenir au moins ${REASON_MIN} caractères.`);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/staff/accounts/${encodeURIComponent(accountId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: pending, reason: trimmed }),
      });
      const payload = (await response.json().catch(() => ({}))) as ApiResponse<unknown>;

      if (!response.ok || !payload.success) {
        setError(payload.message ?? 'Action impossible. Réessayez.');
        return;
      }

      setSuccess(payload.message ?? 'Statut mis à jour.');
      setPending(null);
      router.refresh();
    } catch {
      setError('Une erreur réseau est survenue. Réessayez.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {success ? <AuthError variant="success" message={success} /> : null}
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button key={action} type="button" variant={action === 'reactivate' ? 'primary' : 'outline'} size="sm" onClick={() => open(action)}>
            {MODERATION_ACTION_LABELS[action]}
          </Button>
        ))}
      </div>

      {pending ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center" role="presentation">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onSubmit={submit}
            className="flex w-full max-w-md flex-col gap-4 rounded-xl bg-white p-6 shadow-xl"
          >
            <h2 id={titleId} className="font-serif text-lg font-semibold text-primary">
              {MODERATION_ACTION_LABELS[pending]} le compte de {accountName} ?
            </h2>
            <p className="text-sm text-slate-600">{CONFIRM_TEXT[pending]}</p>

            {error ? <AuthError message={error} /> : null}

            <div className="flex flex-col gap-1.5">
              <label htmlFor={reasonId} className="text-sm font-medium text-slate-700">
                Motif (obligatoire, visible uniquement par le personnel)
              </label>
              <textarea
                id={reasonId}
                ref={textareaRef}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                minLength={REASON_MIN}
                maxLength={REASON_MAX}
                required
                rows={4}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <span className="text-xs text-slate-500">
                {reason.trim().length} / {REASON_MAX} caractères
              </span>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={() => setPending(null)} disabled={isSubmitting}>
                Annuler
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={isSubmitting}>
                {isSubmitting ? 'Enregistrement…' : `Confirmer : ${MODERATION_ACTION_LABELS[pending].toLowerCase()}`}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
