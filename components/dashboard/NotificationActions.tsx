'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { Check, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { ApiResponse } from '@/types';

/** Appelle une route PATCH existante, puis recharge les données du serveur. */
function useMarkRead(url: string) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(url, { method: 'PATCH' });
      const payload = (await response.json().catch(() => ({ success: false }))) as ApiResponse<unknown>;

      if (!response.ok || !payload.success) {
        setError(payload.message ?? 'Action impossible. Réessayez.');
        return;
      }

      router.refresh();
    } catch {
      setError('Une erreur réseau est survenue. Réessayez.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return { submit, isSubmitting, error };
}

function ActionError({ message }: { message: string | null }): ReactElement | null {
  return message ? (
    <p role="alert" className="text-xs text-danger">
      {message}
    </p>
  ) : null;
}

export function MarkReadButton({ notificationId, title }: { notificationId: string; title: string }): ReactElement {
  const { submit, isSubmitting, error } = useMarkRead(`/api/notifications/${encodeURIComponent(notificationId)}/read`);

  return (
    <div className="flex flex-col gap-1 sm:items-end">
      <Button type="button" variant="ghost" size="sm" onClick={submit} disabled={isSubmitting} aria-label={`Marquer comme lue : ${title}`}>
        <Check className="h-4 w-4" aria-hidden="true" />
        Marquer comme lue
      </Button>
      <ActionError message={error} />
    </div>
  );
}

export function MarkAllReadButton(): ReactElement {
  const { submit, isSubmitting, error } = useMarkRead('/api/notifications/read-all');

  return (
    <div className="flex flex-col gap-1 sm:items-end">
      <Button type="button" variant="outline" size="sm" onClick={submit} disabled={isSubmitting}>
        <CheckCheck className="h-4 w-4" aria-hidden="true" />
        Tout marquer comme lu
      </Button>
      <ActionError message={error} />
    </div>
  );
}
